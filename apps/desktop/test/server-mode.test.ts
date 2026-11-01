import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { RiotApi } from "@ldc/riot-api";
import { createApp, createInvite, openDb, SyncScheduler } from "@ldc/server";
import { AccountStore, type SecretBox } from "../src/main/account-store";
import { findConfigDir, loadConfig } from "../src/main/config";
import { PersonalCoach, uiCopy } from "../src/main/personal-coach";
import { profileMode, ServerProfileSource } from "../src/main/profile-source";
import { normalizeServerUrl, ServerClient, ServerError, WAKE_RETRY_DELAYS_MS } from "../src/main/server-client";
import type { AccountView } from "../src/shared/view";
import { fakeDdragonFetch, fakeRiotFetch, waitFor } from "./helpers";

const config = loadConfig(findConfigDir(__dirname));
const BASE = "https://coach.test";
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
/** Stand-in for safeStorage: reversible, and the plain token never appears in the file. */
const box: SecretBox = { encrypt: (s) => `x:${[...s].reverse().join("")}`, decrypt: (s) => [...s.slice(2)].reverse().join("") };

/** The real server API in-process, backed by the fake Riot API (every Riot ID resolves to the test player). */
function startServer(history = config.app.history) {
  const db = openDb(":memory:");
  const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fakeRiotFetch().fetchFn });
  const sync = new SyncScheduler(db, riot, { history, bands: config.bands }, {
    tickMs: 1e9,
    staleAfterMs: 1e9,
    activeWithinMs: 1e9,
    log: () => {},
  });
  const app = createApp({ db, version: "test", riot, sync, registerPerMinute: 100 });
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => app.request(String(input), init)) as typeof fetch;
  const invite = () => createInvite(db, { ttlDays: 1, now: Date.now() }).code;
  return { db, fetchFn, invite };
}

function source(server: ReturnType<typeof startServer>, file = join(tmp("ldc-acct-"), "account.json")) {
  const s = new ServerProfileSource({ accounts: new AccountStore(file, box), defaultServerUrl: BASE, fetch: server.fetchFn, pollMs: 5 });
  const accounts: AccountView[] = [];
  s.on("account", (a) => accounts.push(a));
  return { s, file, accounts };
}

describe("profile mode", () => {
  it("uses the server unless this is a development build with a key and no server address", () => {
    expect(profileMode({ packaged: false, riotApiKey: "k", serverUrl: null })).toBe("direct");
    expect(profileMode({ packaged: true, riotApiKey: "k", serverUrl: null })).toBe("server");
    expect(profileMode({ packaged: false, riotApiKey: "k", serverUrl: "http://localhost:8787" })).toBe("server");
    expect(profileMode({ packaged: false, riotApiKey: null, serverUrl: null })).toBe("server");
  });

  it("normalises server addresses people type", () => {
    expect(normalizeServerUrl(" coach.up.railway.app/ ")).toBe("https://coach.up.railway.app");
    expect(normalizeServerUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(() => normalizeServerUrl("  ")).toThrow(ServerError);
  });
});

describe("ServerProfileSource against the real server API", () => {
  it("registers with an invite, waits for the server's sync and delivers the profile", async () => {
    const server = startServer();
    const { s, file, accounts } = source(server);
    const statuses: string[] = [];
    s.on("status", (st) => statuses.push(st.state));
    let games = 0;
    s.on("profile", (p) => (games = p.games.length));

    await s.init();
    expect(s.account.state).toBe("unregistered");
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    expect(statuses.at(-1)).toBe("idle");

    await s.register(BASE, server.invite());
    expect(s.account).toMatchObject({ state: "registered", riotId: "Me#EUW", serverUrl: BASE });
    expect(accounts.map((a) => a.state)).toEqual(["unregistered", "registering", "registered"]);
    expect(games).toBe(23);
    expect(statuses.at(-1)).toBe("ready");

    // The token is stored encrypted, and survives a restart.
    const stored = readFileSync(file, "utf8");
    expect(stored).not.toMatch(/ldc_/);
    const again = source(server, file);
    await again.s.init();
    expect(again.s.account.state).toBe("registered");
    let againGames = 0;
    again.s.on("profile", (p) => (againGames = p.games.length));
    await again.s.load({ gameName: "me", tagLine: "euw" }, { bandFromApi: true });
    expect(againGames).toBe(23);
  });

  it("says how many older games are still loading when the history is longer than one sync", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0, callsPerSync: 10 });
    const { s } = source(server);
    const statuses: { state: string; backlog?: number }[] = [];
    s.on("status", (st) => statuses.push(st as { state: string; backlog?: number }));
    await s.init();
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register(BASE, server.invite());
    expect(statuses.at(-1)).toMatchObject({ state: "ready", games: 10, backlog: 13 });
  });

  it("refuses to load someone else's profile when another account is logged into the client", async () => {
    const server = startServer();
    const { s } = source(server);
    await s.init();
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register(BASE, server.invite());
    let loaded = false;
    s.on("profile", () => (loaded = true));
    await s.load({ gameName: "Sibling", tagLine: "EUW" }, { bandFromApi: false });
    expect(s.account.state).toBe("mismatch");
    expect(s.account.message).toMatch(/set up for Me#EUW/);
    expect(loaded).toBe(false);
  });

  it("prefills an invite from a join link, and only says so when this app is already connected", async () => {
    const server = startServer();
    const { s } = source(server);
    await s.init();
    s.offerInvite("HJ0S-XYFW-G0C6");
    expect(s.account).toMatchObject({ state: "unregistered", inviteCode: "HJ0S-XYFW-G0C6" });
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register(BASE, server.invite());
    expect(s.account).toMatchObject({ state: "registered", inviteCode: null });
    s.offerInvite("AAAA-BBBB-CCCC");
    expect(s.account).toMatchObject({ state: "registered", riotId: "Me#EUW", message: expect.stringMatching(/already connected as Me#EUW.*sign out first/) });
  });

  it("explains a bad invite and needs the client open to register", async () => {
    const server = startServer();
    const { s } = source(server);
    await s.init();
    await s.register(BASE, server.invite());
    expect(s.account).toMatchObject({ state: "error", message: expect.stringMatching(/League client/) });

    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register(BASE, "WRNG-CODE-0000");
    expect(s.account).toMatchObject({ state: "error", message: expect.stringMatching(/invite code/) });
  });

  it("deletes the player's data on the server and signs out", async () => {
    const server = startServer();
    const { s, file } = source(server);
    await s.init();
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register(BASE, server.invite());
    expect(server.db.$client.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });

    await s.deleteData();
    expect(server.db.$client.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 0 });
    expect(server.db.$client.prepare("SELECT COUNT(*) AS n FROM matches").get()).toEqual({ n: 0 });
    expect(s.account.state).toBe("unregistered");
    expect(() => readFileSync(file)).toThrow();
  });

  it("falls back to registration when the server no longer knows the token", async () => {
    const server = startServer();
    const { s } = source(server);
    await s.init();
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register(BASE, server.invite());
    server.db.$client.prepare("DELETE FROM users").run();

    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    expect(s.account).toMatchObject({ state: "unregistered", message: expect.stringMatching(/Register again/) });
  });

  it("retries while a sleeping server wakes up (502s, dropped connections)", async () => {
    let calls = 0;
    const waking = (async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      if (calls === 2) return new Response("Bad Gateway", { status: 502 });
      return Response.json({ sync: { state: "idle" } });
    }) as typeof fetch;
    const waits: number[] = [];
    const client = new ServerClient(BASE, "t", waking, async (ms) => void waits.push(ms));
    expect(await client.syncState()).toEqual({ state: "idle" });
    expect(calls).toBe(3);
    expect(waits).toEqual(WAKE_RETRY_DELAYS_MS.slice(0, 2));
  });

  describe("timeouts and failures", () => {
    const fast = { responseMs: 5, totalMs: 50 };
    const noWait = async () => {};
    /** Never answers, but ends when the request's signal fires (as fetch does). */
    const hang = (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason as Error)));
    const failure = (p: Promise<unknown>) => p.then(() => null, (err: unknown) => err as ServerError);

    it("gives up on a server that accepts and never answers, after retrying like a dropped connection", async () => {
      let calls = 0;
      const client = new ServerClient(BASE, "t", ((u: string, i?: RequestInit) => (calls++, hang(u, i))) as typeof fetch, noWait, fast);
      expect(await failure(client.syncState())).toMatchObject({ status: 0, code: "timeout", message: expect.stringMatching(/didn't answer within/) });
      expect(calls).toBe(WAKE_RETRY_DELAYS_MS.length + 1);
    });

    it("succeeds when a hung first attempt is followed by an answer", async () => {
      let calls = 0;
      const fetchFn = ((u: string, i?: RequestInit) => (++calls === 1 ? hang(u, i) : Promise.resolve(Response.json({ sync: { state: "idle" } })))) as typeof fetch;
      expect(await new ServerClient(BASE, "t", fetchFn, noWait, fast).syncState()).toEqual({ state: "idle" });
      expect(calls).toBe(2);
    });

    it("ends a body that stops arriving", async () => {
      const stalled = (async () => new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"sync":')) }))) as typeof fetch;
      expect(await failure(new ServerClient(BASE, "t", stalled, noWait, fast).syncState())).toMatchObject({ code: "timeout", message: expect.stringMatching(/stopped sending/) });
    });

    it("says the connection broke when the body fails", async () => {
      const broken = (async () => new Response(new ReadableStream({ start: (c) => c.error(new Error("ECONNRESET")) }))) as typeof fetch;
      expect(await failure(new ServerClient(BASE, "t", broken, noWait, fast).syncState())).toMatchObject({ code: "unreachable", message: expect.stringMatching(/broke \(ECONNRESET\)/) });
    });

    it("says the server is still starting when it answers 502–504 to every retry", async () => {
      const asleep = (async () => new Response("Service Unavailable", { status: 503 })) as typeof fetch;
      expect(await failure(new ServerClient(BASE, "t", asleep, noWait, fast).syncState())).toMatchObject({ status: 503, code: "asleep" });
    });

    it("tells a server fault from a refused request, also without a JSON body", async () => {
      const status = (s: number) => (async () => new Response("<html>oops</html>", { status: s })) as typeof fetch;
      expect(await failure(new ServerClient(BASE, "t", status(500), noWait, fast).syncState())).toMatchObject({ status: 500, code: "server_error", message: expect.stringMatching(/had a problem \(HTTP 500\)/) });
      expect(await failure(new ServerClient(BASE, "t", status(400), noWait, fast).syncState())).toMatchObject({ status: 400, code: "http_error" });
    });

    it("rejects a 200 that isn't the expected JSON", async () => {
      const html = (async () => new Response("<html>captive portal</html>", { status: 200 })) as typeof fetch;
      expect(await failure(new ServerClient(BASE, "t", html, noWait, fast).syncState())).toMatchObject({ code: "bad_response" });
    });
  });

  it("explains an unreachable server", async () => {
    const offline = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
    const s = new ServerProfileSource({ accounts: new AccountStore(join(tmp("ldc-acct-"), "a.json"), box), defaultServerUrl: null, fetch: offline, sleep: async () => {} });
    await s.init();
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register("coach.example", "AAAA-BBBB-CCCC");
    expect(s.account.message).toBe("Can't reach the coach server: check your internet connection.");
  });
});

describe("ServerProfileSource match cache (kept on disk between starts)", () => {
  const ME = { gameName: "Me", tagLine: "EUW" };
  const history = { ...config.app.history, timelineCount: 0 };

  /** A source with its match cache in `dir`; `edit` may change the server's responses. */
  function cached(server: ReturnType<typeof startServer>, dir: string, edit?: (path: string, body: Record<string, unknown>) => void) {
    const paths: string[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      const res = await server.fetchFn(input, init);
      if (!edit || url.pathname !== "/me/profile" || !res.ok) return res;
      const body = (await res.json()) as Record<string, unknown>;
      edit(url.pathname, body);
      return Response.json(body);
    }) as typeof fetch;
    const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: fetchFn, pollMs: 5, cacheFile: join(dir, "matches.json") });
    let games = -1;
    s.on("profile", (p) => (games = p.games.length));
    return { s, paths, games: () => games, profileCalls: () => paths.filter((p) => p.startsWith("/me/profile")) };
  }

  /** Registers (the whole history comes down once) and waits for the cache file. */
  async function firstStart(server: ReturnType<typeof startServer>) {
    const dir = tmp("ldc-cache-");
    const a = cached(server, dir);
    await a.s.init();
    await a.s.load(ME, { bandFromApi: false });
    await a.s.register(BASE, server.invite());
    expect(a.games()).toBe(23);
    await waitFor(() => existsSync(join(dir, "matches.json")));
    return { dir, first: a };
  }
  const cacheOf = (dir: string) => JSON.parse(readFileSync(join(dir, "matches.json"), "utf8")) as { riotId: string; matches: { match: { matchId: string; timeline?: unknown } }[] };

  it("asks only for new games on the next start, with the same profile", async () => {
    const server = startServer(history);
    const { dir } = await firstStart(server);
    expect(cacheOf(dir)).toMatchObject({ riotId: "Me#EUW" });
    const b = cached(server, dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    expect(b.games()).toBe(23);
    expect(b.profileCalls()).toHaveLength(1);
    expect(b.profileCalls()[0]).toMatch(/since=\d+&timelines=1$/);
  });

  it("asks by name for a game the cache lacks (e.g. an older game loaded in the background)", async () => {
    const server = startServer(history);
    const { dir } = await firstStart(server);
    const c = cacheOf(dir);
    const dropped = c.matches.at(-1)!.match.matchId;
    writeFileSync(join(dir, "matches.json"), JSON.stringify({ ...c, matches: c.matches.slice(0, -1) }));
    const b = cached(server, dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    expect(b.games()).toBe(23);
    expect(b.profileCalls().at(-1)).toContain(`ids=${dropped}`);
  });

  it("asks again for a game the server has given a timeline since", async () => {
    const server = startServer(history);
    const { dir } = await firstStart(server);
    const id = cacheOf(dir).matches[0]!.match.matchId;
    server.db.$client.prepare(`UPDATE matches SET summary = json_set(summary, '$.timeline', json('{"gold":[],"items":[],"skills":[],"monsters":[]}')) WHERE match_id = ?`).run(id);
    const b = cached(server, dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    expect(b.profileCalls().at(-1)).toContain(`ids=${id}`);
    await waitFor(() => cacheOf(dir).matches.find((m) => m.match.matchId === id)?.match.timeline !== undefined);
  });

  it("downloads the whole history from a server that can't say what changed (an older server)", async () => {
    const server = startServer(history);
    const { dir } = await firstStart(server);
    const b = cached(server, dir, (_path, body) => delete body.timelineIds);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    expect(b.games()).toBe(23);
    expect(b.profileCalls().at(-1)).toBe("/me/profile");
  });

  describe("when the server fails", () => {
    type Status = { state: string; games?: number; problem?: string; message?: string };
    /** A registered source whose server can be switched off; retries come after `retryMs`. */
    function flaky(server: ReturnType<typeof startServer>, dir: string, fail: () => Response | Error, retryMs = [30, 60]) {
      const down = { on: true, calls: 0 };
      const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        down.calls++;
        if (!down.on) return server.fetchFn(input, init);
        const f = fail();
        if (f instanceof Error) throw f;
        return f;
      }) as typeof fetch;
      const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: fetchFn, sleep: async () => {}, pollMs: 5, cacheFile: join(dir, "matches.json"), retryDelaysMs: retryMs });
      const statuses: Status[] = [];
      s.on("status", (st) => statuses.push(st as Status));
      let masteries = -1;
      let games = -1;
      s.on("profile", (p) => ((games = p.games.length), (masteries = p.masteries.length)));
      return { s, down, statuses, games: () => games, masteries: () => masteries };
    }

    it("keeps coaching from the games saved on this PC, says why, and recovers by itself", async () => {
      const server = startServer(history);
      const { dir } = await firstStart(server);
      const b = flaky(server, dir, () => new Response("oops", { status: 500 }));
      await b.s.init();
      await b.s.load(ME, { bandFromApi: false });
      expect(b.games()).toBe(23);
      expect(b.masteries()).toBeGreaterThan(0);
      expect(b.statuses.at(-1)).toMatchObject({ state: "ready", games: 23, problem: expect.stringMatching(/had a problem \(HTTP 500\)\. Trying again automatically/) });
      b.down.on = false;
      await waitFor(() => b.statuses.at(-1)?.state === "ready" && !b.statuses.at(-1)?.problem);
      b.s.stop();
    });

    it("without saved games, says what went wrong and tries again, later each time", async () => {
      const dir = tmp("ldc-down-");
      await new AccountStore(join(dir, "account.json"), box).save({ serverUrl: BASE, token: "t", riotId: "Me#EUW" });
      const b = flaky(startServer(history), dir, () => new Error("ECONNREFUSED"), [20, 2_000]);
      await b.s.init();
      await b.s.load(ME, { bandFromApi: false });
      expect(b.statuses.at(-1)).toMatchObject({ state: "error", message: expect.stringMatching(/^Can't reach the coach server: check your internet connection\. Trying again automatically\./) });
      const first = b.down.calls;
      await waitFor(() => b.statuses.filter((x) => x.state === "error").length === 2);
      expect(b.down.calls).toBe(first * 2);
      // Stopping cancels the next try.
      b.s.stop();
      await new Promise((r) => setTimeout(r, 50));
      expect(b.down.calls).toBe(first * 2);
    });

    it("signing out cancels the retry", async () => {
      const dir = tmp("ldc-down-");
      await new AccountStore(join(dir, "account.json"), box).save({ serverUrl: BASE, token: "t", riotId: "Me#EUW" });
      const b = flaky(startServer(history), dir, () => new Error("ECONNREFUSED"), [20]);
      await b.s.init();
      await b.s.load(ME, { bandFromApi: false });
      const calls = b.down.calls;
      await b.s.signOut();
      await new Promise((r) => setTimeout(r, 60));
      expect(b.down.calls).toBe(calls);
    });
  });

  it("forgets the cache on sign out", async () => {
    const server = startServer(history);
    const { dir, first } = await firstStart(server);
    await first.s.signOut();
    expect(existsSync(join(dir, "matches.json"))).toBe(false);
  });
});

describe("PersonalCoach in server mode (mock client + real server API)", () => {
  let lcu: MockLcuServer | null = null;
  let coach: PersonalCoach | null = null;
  afterEach(async () => {
    coach?.stop();
    await lcu?.stop();
  });

  it("shows picks from the player's own pool once registered, with no Riot key in the app", async () => {
    const server = startServer();
    const { s } = source(server);
    await s.init();
    lcu = new MockLcuServer(loadFixture("synthetic-draft-pick"), {
      "/lol-summoner/v1/current-summoner": { puuid: "client-only", gameName: "Me", tagLine: "EUW" },
      "/lol-ranked/v1/current-ranked-stats": { queues: [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", division: "I" }] },
    });
    const creds = await lcu.start();
    coach = new PersonalCoach({
      connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }),
      config,
      profiles: s,
      riotId: null,
    });
    await coach.start();
    expect(coach.state.account?.state).toBe("unregistered");
    await waitFor(() => coach!.currentIdentity !== null);

    await s.register(BASE, server.invite());
    await waitFor(() => coach!.state.status.profile.state === "ready");
    expect(coach.state.account).toMatchObject({ state: "registered", riotId: "Me#EUW" });
    expect(coach.state.status.band).toBe(2); // GOLD, from the client

    while (coach.state.draft?.localAction !== "pick" && lcu.step()) await new Promise((r) => setTimeout(r, 15));
    await waitFor(() => coach!.state.picks.length > 0);
    expect(coach.state.picks.every((p) => [103, 245, 84].includes(p.champion.id))).toBe(true);
  });
});

describe("a sync that keeps failing (the stuck 'Loading your match history: 0 of 0')", () => {
  const ME = { gameName: "Me", tagLine: "EUW" };
  type Status = { state: string; games?: number; done?: number; total?: number; problem?: string; message?: string };

  /** The real server API with on-demand syncs; while `riot.down`, Riot answers 500 for what a sync asks first. */
  function failingServer(history = { ...config.app.history, timelineCount: 0 }) {
    const riotState = { down: false };
    const riotFetch = fakeRiotFetch().fetchFn;
    const fetchRiot = (async (input: string | URL | Request, init?: RequestInit) =>
      riotState.down && String(input).includes("/champion-mastery/") ? new Response("oops", { status: 500 }) : riotFetch(input as never, init)) as typeof fetch;
    const db = openDb(":memory:");
    const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fetchRiot });
    const logs: string[] = [];
    const sync = new SyncScheduler(db, riot, { history, bands: config.bands }, { tickMs: 1e9, staleAfterMs: 1e9, activeWithinMs: 1e9, log: (m) => logs.push(m) });
    const app = createApp({ db, version: "test", riot, sync, registerPerMinute: 100, syncWhenStaleMs: 30 * 60_000 });
    const calls: string[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      // A loop would never end by itself: this ends it, and the counts below fail the test.
      if (calls.length > 200) throw new Error("request loop");
      return app.request(String(input), init);
    }) as typeof fetch;
    return { db, riot: riotState, fetchFn, calls, logs, invite: () => createInvite(db, { ttlDays: 1, now: Date.now() }).code };
  }

  function sourceFor(server: ReturnType<typeof failingServer>, dir = tmp("ldc-fail-")) {
    const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: server.fetchFn, sleep: async () => {}, pollMs: 2, cacheFile: join(dir, "matches.json"), copy: uiCopy(config.explain.templates) });
    const statuses: Status[] = [];
    s.on("status", (st) => statuses.push(st as Status));
    let games = -1;
    s.on("profile", (p) => (games = p.games.length));
    return { s, dir, statuses, games: () => games };
  }

  it("without saved games: says so once, with no loop and no 0 of 0", async () => {
    const server = failingServer();
    server.riot.down = true;
    const { s, statuses } = sourceFor(server);
    await s.init();
    await s.load(ME, { bandFromApi: false });
    await s.register(BASE, server.invite());
    expect(statuses.at(-1)).toMatchObject({ state: "error", message: expect.stringMatching(/Riot isn't answering/) });
    expect(s.account.state).toBe("registered");
    // Registration, a poll or two, one profile read: nothing keeps going.
    const requests = server.calls.length;
    expect(requests).toBeLessThan(6);
    await new Promise((r) => setTimeout(r, 30));
    expect(server.calls.length).toBe(requests);
    s.stop();
  });

  it("with saved games: shows them with a problem, and asks again only when told to", async () => {
    const server = failingServer();
    const first = sourceFor(server);
    await first.s.init();
    await first.s.load(ME, { bandFromApi: false });
    await first.s.register(BASE, server.invite());
    expect(first.games()).toBe(23);
    await first.s.cacheSaved();
    // A later start, once the games are stale and Riot is failing.
    server.db.$client.prepare("UPDATE users SET last_sync_at = 1").run();
    server.riot.down = true;
    server.calls.length = 0;
    const b = sourceFor(server, first.dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    await waitFor(() => b.statuses.at(-1)?.problem !== undefined);
    expect(b.games()).toBe(23);
    expect(b.statuses.at(-1)).toMatchObject({ state: "ready", games: 23, problem: expect.stringMatching(/newest games.*Riot isn't answering/) });
    expect(b.statuses.some((x) => x.state === "loading")).toBe(false);
    expect(server.calls.length).toBeLessThan(6);
    const settled = server.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(server.calls.length).toBe(settled);

    // Riot is back: "Retry now" (or the next champ select) brings the games, and the problem goes.
    server.riot.down = false;
    await b.s.retry();
    await waitFor(() => b.statuses.at(-1)?.state === "ready" && !b.statuses.at(-1)?.problem);
    b.s.stop();
  });

  it("logs each failed sync on the server, without the player's identity", async () => {
    const server = failingServer();
    server.riot.down = true;
    const { s } = sourceFor(server);
    await s.init();
    await s.load(ME, { bandFromApi: false });
    await s.register(BASE, server.invite());
    expect(server.logs).toHaveLength(1);
    expect(server.logs[0]).toMatch(/^sync: user 1 failed: .*HTTP 500/);
    expect(server.logs[0]).not.toMatch(/Me#EUW/);
    s.stop();
  });

  it("a routine sync doesn't flash loading over saved games", async () => {
    const server = failingServer();
    const first = sourceFor(server);
    await first.s.init();
    await first.s.load(ME, { bandFromApi: false });
    await first.s.register(BASE, server.invite());
    await first.s.cacheSaved();
    server.db.$client.prepare("UPDATE users SET last_sync_at = 1").run();
    const b = sourceFor(server, first.dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    expect(b.statuses.length).toBeGreaterThan(0);
    expect(b.statuses.every((x) => x.state === "ready" && x.games === 23 && !x.problem)).toBe(true);
    b.s.stop();
  });

  it("the first load says loading, with a count once there is one", async () => {
    const server = failingServer();
    const { s, statuses } = sourceFor(server);
    await s.init();
    await s.load(ME, { bandFromApi: false });
    await s.register(BASE, server.invite());
    expect(statuses.find((x) => x.state === "loading")).toMatchObject({ done: 0, total: 0 });
    expect(statuses.at(-1)).toMatchObject({ state: "ready", games: 23 });
    s.stop();
  });

  it("retry does nothing when all is well (no needless wake-up)", async () => {
    const server = failingServer();
    const { s } = sourceFor(server);
    await s.init();
    await s.load(ME, { bandFromApi: false });
    await s.register(BASE, server.invite());
    const calls = server.calls.length;
    await s.retry();
    expect(server.calls.length).toBe(calls);
    s.stop();
  });
});

describe("ServerProfileSource: states that used to stick", () => {
  const ME = { gameName: "Me", tagLine: "EUW" };
  type Status = { state: string; games?: number; problem?: string; message?: string; waking?: boolean };

  function setup(fetchFn: typeof fetch, dir = tmp("ldc-state-"), wakeNoticeMs?: number) {
    const s = new ServerProfileSource({
      accounts: new AccountStore(join(dir, "account.json"), box),
      defaultServerUrl: BASE,
      fetch: fetchFn,
      sleep: async () => {},
      pollMs: 2,
      cacheFile: join(dir, "matches.json"),
      retryDelaysMs: [20, 20],
      copy: uiCopy(config.explain.templates),
      ...(wakeNoticeMs !== undefined ? { wakeNoticeMs } : {}),
    });
    const statuses: Status[] = [];
    s.on("status", (st) => statuses.push(st as Status));
    const profiles: number[] = [];
    s.on("profile", (p) => profiles.push(p.games.length));
    const bands: number[] = [];
    s.on("band", (b) => bands.push(b));
    return { s, dir, statuses, profiles, bands };
  }

  /** Saved games on disk from a first registration; the server keeps its games. */
  async function savedGames(server: ReturnType<typeof startServer>) {
    const a = setup(server.fetchFn);
    await a.s.init();
    await a.s.load(ME, { bandFromApi: false });
    await a.s.register(BASE, server.invite());
    await a.s.cacheSaved();
    a.s.stop();
    return a.dir;
  }

  it("a poll failing after a successful registration is not a failed registration, and recovers", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0 });
    let failSync = true;
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      if (failSync && new URL(String(input)).pathname === "/me/sync") return new Response("oops", { status: 500 });
      return server.fetchFn(input, init);
    }) as typeof fetch;
    const { s, statuses } = setup(fetchFn);
    await s.init();
    await s.load(ME, { bandFromApi: false });
    await s.register(BASE, server.invite());
    // The invite is used and the app is registered: it says what's wrong and retries by itself.
    expect(s.account).toMatchObject({ state: "registered", riotId: "Me#EUW", message: null });
    expect(statuses.at(-1)).toMatchObject({ state: "error", message: expect.stringMatching(/had a problem \(HTTP 500\)/) });
    failSync = false;
    await waitFor(() => statuses.at(-1)?.state === "ready" && statuses.at(-1)?.games === 23);
    s.stop();
  });

  it("with the League client closed: shows the saved games and band without asking the server", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0 });
    const dir = await savedGames(server);
    let calls = 0;
    const b = setup((() => (calls++, Promise.reject(new Error("no network")))) as typeof fetch, dir);
    await b.s.init();
    await b.s.loadSaved();
    expect(b.profiles).toEqual([23]);
    expect(b.statuses.at(-1)).toMatchObject({ state: "ready", games: 23 });
    expect(b.bands.length).toBe(1);
    expect(calls).toBe(0);
    b.s.stop();
  });

  it("with the client closed and nothing saved, or not registered: stays idle", async () => {
    const dir = tmp("ldc-state-");
    await new AccountStore(join(dir, "account.json"), box).save({ serverUrl: BASE, token: "t", riotId: "Me#EUW" });
    const b = setup((() => Promise.reject(new Error("no network"))) as typeof fetch, dir);
    await b.s.init();
    await b.s.loadSaved();
    expect(b.statuses).toEqual([]);
    expect(b.profiles).toEqual([]);
    const none = setup((() => Promise.reject(new Error("no network"))) as typeof fetch);
    await none.s.init();
    await none.s.loadSaved();
    expect(none.profiles).toEqual([]);
  });

  it("doesn't read another account's saved games with the client closed", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0 });
    const dir = await savedGames(server);
    const c = JSON.parse(readFileSync(join(dir, "matches.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(dir, "matches.json"), JSON.stringify({ ...c, riotId: "Other#EUW" }));
    const b = setup((() => Promise.reject(new Error("no network"))) as typeof fetch, dir);
    await b.s.init();
    await b.s.loadSaved();
    expect(b.profiles).toEqual([]);
  });

  it("shows the saved games before the network answers, then says the server is waking up", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0 });
    const dir = await savedGames(server);
    let answer: () => void = () => {};
    const slow = (async (input: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((r) => (answer = r));
      return server.fetchFn(input, init);
    }) as typeof fetch;
    const b = setup(slow, dir, 1);
    await b.s.init();
    const load = b.s.load(ME, { bandFromApi: false });
    await waitFor(() => b.statuses.some((x) => x.waking));
    expect(b.profiles).toEqual([23]);
    expect(b.statuses[0]).toMatchObject({ state: "ready", games: 23 });
    expect(b.statuses.at(-1)).toMatchObject({ state: "ready", games: 23, waking: true });
    answer();
    await load;
    expect(b.statuses.at(-1)).toMatchObject({ state: "ready", games: 23 });
    expect(b.statuses.at(-1)!.waking).toBeUndefined();
    // Nothing new came: the same profile isn't worked out a second time.
    expect(b.profiles).toEqual([23]);
    b.s.stop();
  });

  it("without saved games, a slow answer says the server is waking up too", async () => {
    const dir = tmp("ldc-state-");
    await new AccountStore(join(dir, "account.json"), box).save({ serverUrl: BASE, token: "t", riotId: "Me#EUW" });
    const b = setup((() => new Promise<Response>(() => {})) as typeof fetch, dir, 1);
    await b.s.init();
    void b.s.load(ME, { bandFromApi: false });
    await waitFor(() => b.statuses.at(-1)?.waking === true);
    expect(b.statuses.at(-1)).toMatchObject({ state: "loading", done: 0, total: 0, waking: true });
    b.s.stop();
  });

  it("clears the different-account state when the right account returns", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0 });
    const { s, statuses } = setup(server.fetchFn);
    await s.init();
    await s.load(ME, { bandFromApi: false });
    await s.register(BASE, server.invite());
    await s.load({ gameName: "Sibling", tagLine: "EUW" }, { bandFromApi: false });
    expect(s.account.state).toBe("mismatch");
    expect(s.serverClient).toBeNull();
    await s.load({ gameName: "me", tagLine: "euw" }, { bandFromApi: false });
    expect(s.account).toMatchObject({ state: "registered", riotId: "Me#EUW", message: null });
    expect(s.serverClient).not.toBeNull();
    expect(statuses.at(-1)).toMatchObject({ state: "ready", games: 23 });
    s.stop();
  });

  it("Retry now asks a failed server at once, instead of after its wait", async () => {
    const server = startServer({ ...config.app.history, timelineCount: 0 });
    const dir = await savedGames(server);
    const net = { down: true };
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => (net.down ? new Response("oops", { status: 500 }) : server.fetchFn(input, init))) as typeof fetch;
    const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: fetchFn, sleep: async () => {}, cacheFile: join(dir, "matches.json"), retryDelaysMs: [1e7] });
    const statuses: Status[] = [];
    s.on("status", (st) => statuses.push(st as Status));
    await s.init();
    await s.load(ME, { bandFromApi: false });
    expect(statuses.at(-1)?.problem).toBeDefined();
    net.down = false;
    await s.retry();
    expect(statuses.at(-1)).toMatchObject({ state: "ready", games: 23 });
    expect(statuses.at(-1)!.problem).toBeUndefined();
    s.stop();
  });
});

describe("PersonalCoach and a server having problems", () => {
  const offline = () => new LcuConnector({ discover: async () => null, pollIntervalMs: 1e6 });
  /** A profile source and a meta source that only record what they're asked. */
  function fakes() {
    const profiles = Object.assign(new EventEmitter(), {
      load: async () => {},
      refresh: async () => {},
      recordAdvice: async () => {},
      loadSaved: vi.fn(async () => {}),
      retry: vi.fn(async () => {}),
    });
    const meta = Object.assign(new EventEmitter(), { snapshot: null, refresh: vi.fn(async () => {}) });
    return { profiles, meta };
  }
  let lcu: MockLcuServer | null = null;
  let coach: PersonalCoach | null = null;
  afterEach(async () => {
    coach?.stop();
    await lcu?.stop();
    lcu = null;
  });
  const coachWith = (connector: LcuConnector, f: ReturnType<typeof fakes>) =>
    new PersonalCoach({ connector, ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }), config, profiles: f.profiles as never, meta: f.meta as never, riotId: null });

  it("loads the saved games at launch when the League client is closed", async () => {
    const f = fakes();
    coach = coachWith(offline(), f);
    await coach.start();
    await waitFor(() => f.profiles.loadSaved.mock.calls.length === 1);
  });

  it("refreshes the meta once the server recovers, not on every healthy status", async () => {
    const f = fakes();
    coach = coachWith(offline(), f);
    await coach.start();
    const ready = { state: "ready", games: 3, role: null };
    f.profiles.emit("status", ready);
    f.meta.refresh.mockClear();
    f.profiles.emit("status", ready);
    expect(f.meta.refresh).not.toHaveBeenCalled();
    f.profiles.emit("status", { ...ready, problem: "down" });
    expect(f.meta.refresh).not.toHaveBeenCalled();
    f.profiles.emit("status", { state: "loading", done: 0, total: 0 });
    expect(f.meta.refresh).not.toHaveBeenCalled();
    f.profiles.emit("status", ready);
    expect(f.meta.refresh).toHaveBeenCalledTimes(1);
    f.profiles.emit("status", ready);
    expect(f.meta.refresh).toHaveBeenCalledTimes(1);
  });

  it("Retry now tries both your games and the meta", async () => {
    const f = fakes();
    coach = coachWith(offline(), f);
    await coach.start();
    f.meta.refresh.mockClear();
    await coach.retryNow();
    expect(f.profiles.retry).toHaveBeenCalledTimes(1);
    expect(f.meta.refresh).toHaveBeenCalledTimes(1);
  });

  it("tries both again when a champ select starts", async () => {
    const f = fakes();
    lcu = new MockLcuServer(loadFixture("synthetic-draft-pick"), { "/lol-summoner/v1/current-summoner": { puuid: "client-only", gameName: "Me", tagLine: "EUW" } });
    const creds = await lcu.start();
    coach = coachWith(new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }), f);
    await coach.start();
    while (!coach.state.draft && lcu.step()) await new Promise((r) => setTimeout(r, 15));
    await waitFor(() => f.profiles.retry.mock.calls.length === 1);
    expect(f.meta.refresh).toHaveBeenCalled();
  });
});
