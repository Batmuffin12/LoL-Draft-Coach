import { mkdtempSync, readFileSync } from "node:fs";
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
import { normalizeServerUrl, ServerError } from "../src/main/server-client";
import type { AccountView } from "../src/shared/view";
import { fakeDdragonFetch, fakeRiotFetch, waitFor } from "./helpers";

const config = loadConfig(findConfigDir(__dirname));
const BASE = "https://coach.test";
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
/** Stand-in for safeStorage: reversible, and the plain token never appears in the file. */
const box: SecretBox = { encrypt: (s) => `x:${[...s].reverse().join("")}`, decrypt: (s) => [...s.slice(2)].reverse().join("") };

/** The real server API in-process, backed by the fake Riot API (every Riot ID resolves to the test player). */
function startServer() {
  const db = openDb(":memory:");
  const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fakeRiotFetch().fetchFn });
  const sync = new SyncScheduler(db, riot, { history: config.app.history, bands: config.bands }, {
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

  it("explains an unreachable server", async () => {
    const offline = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
    const s = new ServerProfileSource({ accounts: new AccountStore(join(tmp("ldc-acct-"), "a.json"), box), defaultServerUrl: null, fetch: offline });
    await s.init();
    await s.load({ gameName: "Me", tagLine: "EUW" }, { bandFromApi: false });
    await s.register("coach.example", "AAAA-BBBB-CCCC");
    expect(s.account.message).toMatch(/Can't reach the coach server at https:\/\/coach.example/);
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
