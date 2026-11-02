import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Loadout } from "@ldc/engine";
import { LcuWriteError, type LcuConnector } from "@ldc/lcu";
import { RiotApi } from "@ldc/riot-api";
import { createApp, createInvite, openDb, SyncScheduler } from "@ldc/server";
import { AccountStore, type SecretBox } from "../src/main/account-store";
import { AdviceStore } from "../src/main/advice-store";
import { findConfigDir, loadConfig } from "../src/main/config";
import { ConfigSource } from "../src/main/config-source";
import { ImportFlow } from "../src/main/import-flow";
import { importShownLoadout } from "../src/main/loadout-import";
import { MatchStore } from "../src/main/match-store";
import { MetaSource } from "../src/main/meta-source";
import { logProblem } from "../src/main/problem-log";
import { ServerProfileSource } from "../src/main/profile-source";
import { ServerError } from "../src/main/server-client";
import { fakeRiotFetch } from "./helpers";

vi.mock("../src/main/problem-log", () => ({ logProblem: vi.fn(), scrubText: (s: string) => s }));

const config = loadConfig(findConfigDir(__dirname));
const BASE = "https://coach.test";
const ME = { gameName: "Me", tagLine: "EUW" };
const tmp = (p = "ldc-fail-") => mkdtempSync(join(tmpdir(), p));
const box: SecretBox = { encrypt: (s) => `x:${s}`, decrypt: (s) => s.slice(2) };
const history = { ...config.app.history, timelineCount: 0 };

beforeEach(() => vi.mocked(logProblem).mockClear());

function startServer() {
  const db = openDb(":memory:");
  const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fakeRiotFetch().fetchFn });
  const sync = new SyncScheduler(db, riot, { history, bands: config.bands }, { tickMs: 1e9, staleAfterMs: 1e9, activeWithinMs: 1e9, log: () => {} });
  const app = createApp({ db, version: "test", riot, sync, registerPerMinute: 100 });
  return { db, fetchFn: ((input: string | URL | Request, init?: RequestInit) => app.request(String(input), init)) as typeof fetch, invite: () => createInvite(db, { ttlDays: 1, now: Date.now() }).code };
}

type Status = { state: string; games?: number; message?: string; problem?: string };

/** A source whose server can hold any request back; `dir` holds its account and its match cache. */
function source(fetchFn: typeof fetch, dir = tmp()) {
  const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: fetchFn, sleep: async () => {}, pollMs: 1, cacheFile: join(dir, "matches.json"), retryDelaysMs: [60_000] });
  const statuses: Status[] = [];
  const profiles: number[] = [];
  s.on("status", (st) => statuses.push(st as Status));
  s.on("profile", (p) => profiles.push(p.games.length));
  return { s, dir, statuses, profiles };
}

async function registered(server: ReturnType<typeof startServer>) {
  const a = source(server.fetchFn);
  await a.s.init();
  await a.s.load(ME, { bandFromApi: false });
  await a.s.register(BASE, server.invite());
  await a.s.cacheSaved();
  expect(a.s.account.state).toBe("registered");
  return a;
}

/** Holds back requests whose path passes `when`, until `release`. */
function gated(fetchFn: typeof fetch, when: (path: string) => boolean) {
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let reached = () => {};
  const arrived = new Promise<void>((r) => (reached = r));
  const wrapped = (async (input: string | URL | Request, init?: RequestInit) => {
    if (when(new URL(String(input)).pathname)) {
      reached();
      await gate;
    }
    return fetchFn(input as never, init);
  }) as typeof fetch;
  return { fetchFn: wrapped, arrived, release };
}

describe("signing out while the server is still answering", () => {
  it("a profile arriving after the sign-out shows nothing and saves nothing", async () => {
    const server = startServer();
    const first = await registered(server);
    const gate = gated(server.fetchFn, (p) => p === "/me/profile");
    const b = source(gate.fetchFn, first.dir);
    await b.s.init();
    const load = b.s.load(ME, { bandFromApi: false });
    await gate.arrived;
    await b.s.signOut();
    b.profiles.length = 0;
    b.statuses.length = 0;
    gate.release();
    await load;
    await b.s.cacheSaved();
    // Someone else may sign in next on this PC: the old player's games stay gone.
    expect(b.profiles.filter((n) => n > 0)).toEqual([]);
    expect(b.statuses.filter((st) => st.state !== "idle")).toEqual([]);
    expect(b.s.account.state).toBe("unregistered");
    expect(existsSync(join(first.dir, "matches.json"))).toBe(false);
  });

  it("a sync being waited for ends quietly, with no error on the signed-out screen and no retry", async () => {
    const server = startServer();
    const first = await registered(server);
    let polls = 0;
    const running = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).pathname === "/me/sync" && (init?.method ?? "GET") === "GET") {
        polls++;
        return Response.json({ sync: { state: "running", done: 1, total: 5 } });
      }
      return server.fetchFn(input as never, init);
    }) as typeof fetch;
    const b = source(running, first.dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    const refresh = b.s.refresh();
    while (polls < 2) await new Promise((r) => setTimeout(r, 1));
    b.statuses.length = 0;
    await b.s.signOut();
    await refresh;
    const after = polls;
    await new Promise((r) => setTimeout(r, 10));
    expect(polls).toBe(after);
    expect(b.statuses.filter((st) => st.state === "error")).toEqual([]);
    expect(b.s.account.state).toBe("unregistered");
    expect(vi.mocked(logProblem).mock.calls.filter(([m]) => m.includes("Cannot read"))).toEqual([]);
    b.s.stop();
  });

  it("a poll that fails after the sign-out isn't a problem to report: that registration is gone", async () => {
    const server = startServer();
    const first = await registered(server);
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    let asked = () => {};
    const arrived = new Promise<void>((r) => (asked = r));
    const failing = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).pathname === "/me/sync" && (init?.method ?? "GET") === "GET") {
        asked();
        await held;
        return new Response("oops", { status: 400 });
      }
      return server.fetchFn(input as never, init);
    }) as typeof fetch;
    const b = source(failing, first.dir);
    await b.s.init();
    await b.s.load(ME, { bandFromApi: false });
    const refresh = b.s.refresh();
    await arrived;
    await b.s.signOut();
    b.statuses.length = 0;
    release();
    await refresh;
    expect(b.statuses).toEqual([]);
    b.s.stop();
  });

  it("a new sign-in doesn't take the old request's answer", async () => {
    const server = startServer();
    const first = await registered(server);
    // Only the first ask is held: that one belongs to the old registration.
    let asks = 0;
    const held = gated(server.fetchFn, (p) => p === "/me/profile" && ++asks === 1);
    const c = source(held.fetchFn, first.dir);
    await c.s.init();
    const load = c.s.load(ME, { bandFromApi: false });
    await held.arrived;
    await c.s.signOut();
    await c.s.load(ME, { bandFromApi: false });
    await c.s.register(BASE, server.invite());
    expect(c.s.account.state).toBe("registered");
    const shown = c.profiles.length;
    held.release();
    await load;
    expect(c.profiles).toHaveLength(shown);
    c.s.stop();
  });

  it("signing out straight after a start, while the saved games are still being read", async () => {
    const server = startServer();
    const first = await registered(server);
    const b = source(server.fetchFn, first.dir);
    await b.s.init();
    const load = b.s.load(ME, { bandFromApi: false });
    await b.s.signOut();
    b.profiles.length = 0;
    await load;
    expect(b.profiles.filter((n) => n > 0)).toEqual([]);
    expect(existsSync(join(first.dir, "matches.json"))).toBe(false);
  });

  it("a record being sent when you sign out doesn't turn into an error, and the rest aren't sent", async () => {
    const posts: number[] = [];
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const dir = tmp();
    const server = startServer();
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).pathname === "/advice") {
        posts.push(1);
        await gate;
        return new Response(null, { status: 204 });
      }
      return server.fetchFn(input as never, init);
    }) as typeof fetch;
    const outbox = new AdviceStore(join(dir, "outbox.json"));
    const record = (gameId: number) => ({ gameId, queueId: 420, role: "middle", band: 2, lockedAt: 1_000 + gameId, pick: { championId: 103, expectedWin: 0.52, terms: [] }, shown: [] }) as never;
    await outbox.add(record(1));
    await outbox.add(record(2));
    const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: fetchFn, sleep: async () => {}, pollMs: 1, outbox });
    const statuses: Status[] = [];
    s.on("status", (st) => statuses.push(st as Status));
    await s.init();
    await s.load(ME, { bandFromApi: false });
    const registering = s.register(BASE, server.invite());
    while (!posts.length) await new Promise((r) => setTimeout(r, 1));
    await s.signOut();
    statuses.length = 0;
    release();
    await registering;
    expect(posts).toHaveLength(1);
    expect(statuses.filter((st) => st.state === "error")).toEqual([]);
    expect(await outbox.list()).toEqual([]);
  });
});

describe("saved files that are damaged", () => {
  describe("the match cache", () => {
    const profileAsks = (paths: string[]) => paths.filter((p) => p.startsWith("/me/profile"));
    const start = async (edit: (cache: Record<string, unknown>) => unknown, text?: string) => {
      const server = startServer();
      const first = await registered(server);
      const file = join(first.dir, "matches.json");
      const cache = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      writeFileSync(file, text ?? JSON.stringify(edit(cache)));
      const paths: string[] = [];
      const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        paths.push(url.pathname + url.search);
        return server.fetchFn(input as never, init);
      }) as typeof fetch;
      const b = source(fetchFn, first.dir);
      await b.s.init();
      await b.s.load(ME, { bandFromApi: false });
      await b.s.cacheSaved();
      return { b, file, asks: profileAsks(paths) };
    };

    it.each([
      ["half a file", "", '{"serverUrl":"https://coach.test","matches":[{"mat'],
      ["empty", "", ""],
      ["not an object", "", "[]"],
    ])("%s: downloads the whole history and writes a good file", async (_name, _x, text) => {
      const { b, file, asks } = await start((c) => c, text);
      expect(b.profiles.at(-1)).toBe(23);
      expect(asks).toEqual(["/me/profile"]);
      expect((JSON.parse(readFileSync(file, "utf8")) as { matches: unknown[] }).matches).toHaveLength(23);
    });

    it("a match of the wrong shape: the same, rather than coaching from it", async () => {
      const { b, asks } = await start((c) => ({ ...c, matches: [{ match: { matchId: 7 }, me: "x" }] }));
      expect(b.profiles.at(-1)).toBe(23);
      expect(asks).toEqual(["/me/profile"]);
    });

    it("another account's or another server's cache isn't read", async () => {
      for (const edit of [(c: Record<string, unknown>) => ({ ...c, riotId: "Someone#ELSE" }), (c: Record<string, unknown>) => ({ ...c, serverUrl: "https://other.test" })]) {
        const { b, asks } = await start(edit);
        expect(asks).toEqual(["/me/profile"]);
        expect(b.profiles.at(-1)).toBe(23);
      }
    });

    it("a folder that can't be written costs the cache, not the coaching", async () => {
      const server = startServer();
      const dir = tmp();
      const s = new ServerProfileSource({ accounts: new AccountStore(join(dir, "account.json"), box), defaultServerUrl: BASE, fetch: server.fetchFn, sleep: async () => {}, pollMs: 1, cacheFile: join(dir, "file", "matches.json") });
      writeFileSync(join(dir, "file"), "a file where the folder should go");
      let games = 0;
      s.on("profile", (p) => (games = p.games.length));
      await s.init();
      await s.load(ME, { bandFromApi: false });
      await s.register(BASE, server.invite());
      await expect(s.cacheSaved()).resolves.toBeUndefined();
      expect(games).toBe(23);
    });
  });

  describe("the account file", () => {
    const store = (file: string, b = box) => new AccountStore(file, b);

    it.each([
      ["half a file", '{"serverUrl":"https://coach'],
      ["empty", ""],
      ["null", "null"],
      ["a field missing", '{"serverUrl":"https://coach.test","riotId":"Me#EUW"}'],
      ["a field of the wrong type", '{"serverUrl":1,"riotId":"Me#EUW","sealedToken":"x:t"}'],
    ])("%s: reads as not registered, so the panel offers to connect", async (_name, text) => {
      const file = join(tmp(), "account.json");
      writeFileSync(file, text);
      expect(await store(file).load()).toBeNull();
      const server = startServer();
      const s = new ServerProfileSource({ accounts: store(file), defaultServerUrl: BASE, fetch: server.fetchFn });
      await s.init();
      expect(s.account.state).toBe("unregistered");
    });

    it("a token the OS can't decrypt any more (a new Windows account) reads as not registered", async () => {
      const file = join(tmp(), "account.json");
      await store(file).save({ serverUrl: BASE, token: "ldc_secret", riotId: "Me#EUW" });
      const broken: SecretBox = { encrypt: (s) => s, decrypt: () => { throw new Error("decrypt failed"); } };
      expect(await store(file, broken).load()).toBeNull();
    });

    it("keeps the token sealed on disk, and clears it however often it's asked", async () => {
      const file = join(tmp(), "deep", "er", "account.json");
      const s = store(file, { encrypt: (t) => [...t].reverse().join(""), decrypt: (t) => [...t].reverse().join("") });
      await s.save({ serverUrl: BASE, token: "ldc_secret", riotId: "Me#EUW" });
      expect(readFileSync(file, "utf8")).not.toContain("ldc_secret");
      expect(await s.load()).toEqual({ serverUrl: BASE, token: "ldc_secret", riotId: "Me#EUW" });
      await s.clear();
      await s.clear();
      expect(await s.load()).toBeNull();
    });
  });

  describe("the advice outbox", () => {
    it.each([
      ["half a file", '[{"gameId":1'],
      ["not a list", '{"gameId":1}'],
      ["a bad record among them", '[{"gameId":"x"}]'],
    ])("%s: starts empty and can still save", async (_name, text) => {
      const file = join(tmp(), "outbox.json");
      writeFileSync(file, text);
      const store = new AdviceStore(file);
      expect(await store.list()).toEqual([]);
      expect(await store.remove([1])).toEqual([]);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([]);
    });

    it("no file yet is an empty list", async () => {
      expect(await new AdviceStore(join(tmp(), "none.json")).list()).toEqual([]);
    });
  });

  describe("a stored match (direct mode)", () => {
    it("reads a broken or pre-0.4 file as missing, so it's fetched again", async () => {
      const root = tmp();
      const store = new MatchStore(root, "puuid");
      const dir = (store as unknown as { dir: string }).dir;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "EUW1_1.json"), "{broken");
      writeFileSync(join(dir, "EUW1_2.json"), JSON.stringify({ match: { matchId: "EUW1_2" }, me: 0 }));
      expect(await store.get("EUW1_1")).toBeNull();
      expect(await store.get("EUW1_2")).toBeNull();
      expect(await store.get("EUW1_3")).toBeNull();
    });
  });

  describe("the server's config, kept on disk", () => {
    it.each([
      ["half a file", '{"etag":"x","config":{'],
      ["no config in it", '{"etag":"x"}'],
      ["a config this version can't use", '{"etag":"x","config":{"app":{},"engine":{},"bands":{},"explain":{}}}'],
    ])("%s: keeps the bundled config, and asks without an ETag", async (_name, text) => {
      const dir = tmp();
      const cacheFile = join(dir, "server-config.json");
      writeFileSync(cacheFile, text);
      const asked: (string | null)[] = [];
      const client = { config: async (etag: string | null) => (asked.push(etag), { notModified: true as const }) };
      const src = new ConfigSource({ client: () => client as never, cacheFile });
      const seen = vi.fn();
      src.on("config", seen);
      await src.loadCached();
      expect(seen).not.toHaveBeenCalled();
      await src.refresh();
      expect(asked).toEqual([null]);
    });
  });

  describe("the meta snapshot, kept on disk", () => {
    it.each([
      ["half a file", '{"etag":"x","snapshot":{'],
      ["a snapshot of the wrong shape", '{"etag":"x","snapshot":{"band":2}}'],
    ])("%s: goes to the server, without showing it", async (_name, text) => {
      const cacheDir = tmp();
      writeFileSync(join(cacheDir, "meta-band-2.json"), text);
      const asked: (string | null)[] = [];
      const client = { meta: async (_b: number, etag: string | null) => (asked.push(etag), Promise.reject(new ServerError(404, "no_snapshot", "nothing yet"))) };
      const src = new MetaSource({ client: () => client as never, cacheDir });
      const statuses: unknown[] = [];
      src.on("status", (s) => statuses.push(s));
      await src.refresh(2);
      expect(asked).toEqual([null]);
      expect(src.snapshot).toBeNull();
      expect(statuses.at(-1)).toMatchObject({ state: "error", noSnapshot: true });
    });
  });
});

describe("deleting your data when the server can't", () => {
  it("keeps you signed in, says it wasn't deleted, and keeps what's needed to try again", async () => {
    const server = startServer();
    const first = await registered(server);
    const down = (async (input: string | URL | Request, init?: RequestInit) => (init?.method === "DELETE" ? new Response("oops", { status: 500 }) : server.fetchFn(input as never, init))) as typeof fetch;
    const b = source(down, first.dir);
    await b.s.init();
    await b.s.deleteData();
    expect(b.s.account).toMatchObject({ state: "registered", message: expect.stringMatching(/wasn't deleted.*HTTP 500/) });
    expect(existsSync(join(first.dir, "account.json"))).toBe(true);
    expect(server.db.$client.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
  });
});

describe("importing when things go wrong", () => {
  const value = { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8138, 8135, 8226, 8210], statPerks: [5001, 5008, 5005] };
  const loadout = { championId: 103, role: "middle", page: { value }, pageAlt: null, spells: { value: [4, 14] }, starting: { value: [1056] }, boots: null, core: { value: [6655] }, items: [], laterPool: [], situational: [] } as unknown as Loadout;
  const say = (id: string) => config.explain.templates[id];

  it("each part says for itself, the writer always closes, and detail stays in the log", async () => {
    const close = vi.fn();
    const writer = {
      importRunePage: async () => Promise.reject(new LcuWriteError("All full", 400, "pagesFull")),
      importSpells: async () => Promise.reject(new Error("socket hang up C:\\Users\\me")),
      importItemSet: async () => Promise.reject(new Error("LCU PUT failed with HTTP 500")),
      close,
    };
    const lines = await importShownLoadout("all", { loadout, champion: "Ahri" }, writer, config);
    expect(lines.map((l) => l.text)).toEqual([say("import.runes.full"), say("import.failed.spells"), say("import.failed.items")]);
    expect(lines.every((l) => l.failed)).toBe(true);
    expect(lines.map((l) => l.text).join()).not.toMatch(/socket|HTTP|Users/);
    expect(close).toHaveBeenCalledOnce();
    expect(vi.mocked(logProblem).mock.calls.map(([m]) => m).join()).toMatch(/socket hang up/);
    // A full page list is everyday: it's said, not logged as a problem.
    expect(vi.mocked(logProblem).mock.calls.map(([m]) => m).join()).not.toMatch(/All full/);
  });

  it("a part that worked isn't marked failed beside one that didn't", async () => {
    const writer = { importRunePage: async () => "created" as const, importSpells: async () => Promise.reject(new Error("x")), importItemSet: async () => {}, close: () => {} };
    const lines = await importShownLoadout("runes", { loadout, champion: "Ahri" }, writer, config);
    expect(lines).toEqual([
      { text: say("import.runes.created"), failed: false },
      { text: say("import.failed.spells"), failed: true },
    ]);
  });

  it("nothing to write says so", async () => {
    const empty = { ...loadout, page: null, spells: null } as unknown as Loadout;
    const lines = await importShownLoadout("runes", { loadout: empty, champion: "Ahri" }, { importRunePage: vi.fn(), importSpells: vi.fn(), importItemSet: vi.fn(), close: () => {} }, config);
    expect(lines).toEqual([{ text: say("import.nothing"), failed: true }]);
  });

  describe("the flow behind the button", () => {
    const flow = (over: { credentials?: unknown; hasDraft?: boolean; cfg?: () => typeof config } = {}) => {
      const notices: [string, string][] = [];
      const redraw = vi.fn();
      const f = new ImportFlow({
        config: over.cfg ?? (() => config),
        connector: { credentials: over.credentials ?? null } as Pick<LcuConnector, "credentials">,
        hasDraft: () => over.hasDraft ?? false,
        notice: (k, t) => notices.push([k, t]),
        clearNotice: () => {},
        redraw,
      });
      return { f, notices, redraw };
    };
    const show = (f: ImportFlow) => ((f as unknown as { shown: unknown }).shown = { loadout, champion: "Ahri" });
    const lines = (f: ImportFlow) => (f as unknown as { lines: unknown }).lines;

    it("in champ select with no card yet, says there's nothing to import", async () => {
      const { f, notices } = flow({ hasDraft: true });
      await f.run("all");
      expect(notices).toEqual([["import", say("import.nothing")]]);
    });

    it("a card kept through the game says import only works in champ select, or nothing when it's off", () => {
      expect(flow().f.keptHint()).toEqual([{ text: say("import.onlyChampSelect"), failed: false }]);
      const off = { ...config, app: { ...config.app, import: { ...config.app.import, enabled: false } } };
      expect(flow({ cfg: () => off }).f.keptHint()).toEqual([]);
    });

    it("forgetting the card leaves nothing to write", async () => {
      const { f, notices } = flow({ credentials: { port: 1, password: "x", protocol: "https" } });
      show(f);
      f.forget();
      await f.run("all");
      expect(notices.map(([k]) => k)).toEqual(["import"]);
    });

    it("an unexpected failure ends in a plain message on the card and a line in the log", async () => {
      // The config breaks after the checks: the import itself throws.
      let calls = 0;
      const broken = () => (++calls > 1 ? ({ ...config, engine: undefined } as unknown as typeof config) : config);
      const { f, redraw } = flow({ credentials: { port: 1, password: "x", protocol: "https" }, cfg: broken });
      show(f);
      await f.run("runes");
      expect(lines(f)).toEqual([{ text: say("import.failed.other"), failed: true }]);
      expect(redraw).toHaveBeenCalledOnce();
      expect(vi.mocked(logProblem).mock.calls[0]![0]).toMatch(/^Import: /);
    });

    it("a client that has gone since the card appeared ends in a message too", async () => {
      const { f } = flow({ credentials: { port: 1, password: "x", protocol: "https" } });
      show(f);
      await f.run("runes");
      expect((lines(f) as { failed: boolean }[]).every((l) => l.failed)).toBe(true);
    }, 15_000);
  });
});

describe("a config refresh that fails", () => {
  it("tries once more later, and stops trying after it's stopped failing", async () => {
    const asked: number[] = [];
    let fail = true;
    const client = {
      config: async () => {
        asked.push(1);
        if (fail) throw new Error("asleep");
        return { notModified: true as const };
      },
    };
    const src = new ConfigSource({ client: () => client as never, cacheFile: join(tmp(), "c.json"), log: () => {}, retryMs: 5 });
    await src.refresh();
    await src.refresh(); // still only one retry waiting
    fail = false;
    await new Promise((r) => setTimeout(r, 40));
    const settled = asked.length;
    expect(settled).toBe(3);
    await new Promise((r) => setTimeout(r, 20));
    expect(asked.length).toBe(settled);
  });

  it("no client: nothing asked, nothing kept", async () => {
    const src = new ConfigSource({ client: () => null, cacheFile: join(tmp(), "c.json") });
    await expect(src.refresh()).resolves.toBeUndefined();
    expect(existsSync(join(tmp(), "c.json"))).toBe(false);
  });
});
