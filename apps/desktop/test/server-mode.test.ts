import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { RiotApi } from "@ldc/riot-api";
import { createApp, createInvite, openDb, SyncScheduler } from "@ldc/server";
import { AccountStore, type SecretBox } from "../src/main/account-store";
import { findConfigDir, loadConfig } from "../src/main/config";
import { PersonalCoach } from "../src/main/personal-coach";
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
    expect(s.account.message).toMatch(/Can't reach the coach server at https:\/\/coach.example/);
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
      expect(b.statuses.at(-1)).toMatchObject({ state: "ready", games: 23, problem: expect.stringMatching(/had a problem \(HTTP 500\)\. Trying again in/) });
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
      expect(b.statuses.at(-1)).toMatchObject({ state: "error", message: expect.stringMatching(/^Can't reach the coach server: check your internet connection\. Trying again in 0 s\./) });
      const first = b.down.calls;
      await waitFor(() => b.statuses.filter((x) => x.state === "error").length === 2);
      expect(b.down.calls).toBe(first * 2);
      expect(b.statuses.at(-1)!.message).toMatch(/Trying again in 2 s\./);
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
