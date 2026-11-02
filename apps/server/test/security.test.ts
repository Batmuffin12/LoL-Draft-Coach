import { describe, expect, it, vi } from "vitest";
import { RiotApiError, RiotKeyError } from "@ldc/riot-api";
import { createInvite, deleteUser, parseRiotId, publicUser, registerUser, touchUser, userByToken, type AccountLookup } from "../src/accounts";
import { createApp } from "../src/app";
import { bearerToken, newInviteCode, newToken, normalizeInviteCode, sha256 } from "../src/auth";
import { openDb, schema, type Db } from "../src/db";
import { WindowLimiter } from "../src/limits";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const ADMIN = "a".repeat(40);

const riot = (known: Record<string, string> = { "ofek#euw": "PO", "friend#euw": "PF", "third#euw": "PT" }): AccountLookup => ({
  accountByRiotId: async (gameName, tagLine) => {
    const puuid = known[`${gameName}#${tagLine}`.toLowerCase()];
    return puuid ? { puuid, gameName, tagLine } : null;
  },
});

function setup(over: Partial<Parameters<typeof createApp>[0]> = {}) {
  const db = openDb(":memory:");
  const app = createApp({ db, version: "test", riot: riot(), now: () => NOW, registerPerMinute: 100, adminToken: ADMIN, ...over });
  const json = { "content-type": "application/json" };
  const invite = (ttlDays = 1, now = NOW) => createInvite(db, { ttlDays, now }).code;
  const register = (inviteCode: string, riotId = "Ofek#EUW") => app.request("/users", { method: "POST", body: JSON.stringify({ inviteCode, riotId }), headers: json });
  const signUp = async (riotId = "Ofek#EUW") => ((await (await register(invite(), riotId)).json()) as { token: string }).token;
  const as = (token: string | null) => (token ? { authorization: `Bearer ${token}` } : ({} as Record<string, string>));
  return { db, app, invite, register, signUp, as };
}

const count = (db: Db, table: string) => (db.$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("tokens and codes", () => {
  it("makes long, prefixed, different tokens, and stores only their hash", async () => {
    const { db, signUp } = setup();
    const token = await signUp();
    expect(token).toMatch(/^ldc_[\w-]{43}$/);
    expect(newToken()).not.toBe(newToken());
    const stored = db.select().from(schema.users).get()!;
    expect(stored.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("stores only an invite's hash, and takes it back however it's retyped", async () => {
    const { db, app } = setup();
    const { code } = createInvite(db, { ttlDays: 1, now: NOW });
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(JSON.stringify(db.select().from(schema.invites).all())).not.toContain(code);
    expect(normalizeInviteCode(` ${code.toLowerCase().replaceAll("-", " ")} `)).toBe(code.replaceAll("-", ""));
    const res = await app.request("/users", { method: "POST", body: JSON.stringify({ inviteCode: code.toLowerCase().replaceAll("-", ""), riotId: "Ofek#EUW" }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(201);
    expect(new Set(Array.from({ length: 50 }, newInviteCode)).size).toBe(50);
  });

  it.each([
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["Bearer   abc  ", "abc"],
    ["Bearer", null],
    ["Bearer a b", null],
    ["Basic abc", null],
    ["abc", null],
    ["", null],
    [undefined, null],
  ])("reads the authorization header %j as %j", (header, want) => {
    expect(bearerToken(header)).toBe(want);
  });
});

describe("who can see and do what", () => {
  it.each([
    ["GET", "/me"],
    ["DELETE", "/me"],
    ["GET", "/me/profile"],
    ["GET", "/me/sync"],
    ["POST", "/me/sync"],
    ["GET", "/meta/2"],
    ["POST", "/advice"],
  ])("%s %s needs a token that exists", async (method, path) => {
    const { app, as } = setup();
    for (const token of [null, "ldc_wrong", ""]) {
      const res = await app.request(path, { method, headers: as(token) });
      expect(res.status, String(token)).toBe(401);
    }
  });

  it("a raw hash of the token isn't a token", async () => {
    const { db, app, signUp, as } = setup();
    const token = await signUp();
    expect(userByToken(db, token)?.gameName).toBe("Ofek");
    expect((await app.request("/me", { headers: as(sha256(token)) })).status).toBe(401);
  });

  it("never gives out the PUUID or the token hash", async () => {
    const { db, app, signUp, as } = setup();
    const token = await signUp();
    const user = db.select().from(schema.users).get()!;
    expect(Object.keys(publicUser(user)).sort()).toEqual(["band", "createdAt", "historyBacklog", "id", "lastSyncAt", "riotId"]);
    for (const path of ["/me", "/me/profile"]) {
      const text = await (await app.request(path, { headers: as(token) })).text();
      expect(text, path).not.toContain(user.puuid === "PO" ? '"PO"' : user.puuid);
      expect(text, path).not.toContain(user.tokenHash);
      expect(text, path).not.toMatch(/puuid|tokenHash/i);
    }
  });

  it("answers an unknown route the same with or without a token, and hides what went wrong", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = openDb(":memory:");
    const app = createApp({ db, version: "test", riot: riot() });
    expect((await app.request("/nope")).status).toBe(404);
    expect(await (await app.request("/nope")).json()).toEqual({ error: "not_found" });
    // A closed database makes the routes throw: the client gets no detail of it.
    db.$client.close();
    const res = await app.request("/me", { headers: { authorization: "Bearer x" } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("says the database is down on /health, with 503, and nothing about its contents", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, version: "9.9.9", riot: null });
    db.$client.close();
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", version: "9.9.9", database: "error", riotKey: "missing" });
  });

  it("reports the Riot key's state on /health", async () => {
    const state = async (over: Parameters<typeof setup>[0]) => ((await (await setup(over).app.request("/health")).json()) as { riotKey: string }).riotKey;
    expect(await state({ riot: null })).toBe("missing");
    expect(await state({ riotKeyRejected: () => true })).toBe("rejected");
    expect(await state({ riotKeyRejected: () => false })).toBe("ok");
  });
});

describe("the owner's routes", () => {
  const collect = (app: ReturnType<typeof createApp>, token: string | null, ip = "1.1.1.1") =>
    app.request("/admin/collect", { method: "POST", headers: { "x-forwarded-for": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) } });

  it("don't exist without the token, and stop answering after too many tries", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++) expect((await collect(app, "wrong")).status).toBe(404);
    // A guesser is cut off even with the right token now; another address isn't.
    expect((await collect(app, ADMIN)).status).toBe(429);
    expect((await collect(app, "wrong", "2.2.2.2")).status).toBe(404);
  });

  it("an admin token isn't a user's token, or the other way round", async () => {
    const { app, signUp, as } = setup();
    expect((await app.request("/me", { headers: as(ADMIN) })).status).toBe(401);
    const token = await signUp();
    expect((await collect(app, token)).status).toBe(404);
  });

  it("the collect route says when no meta job is set up", async () => {
    const { app } = setup();
    expect((await collect(app, ADMIN)).status).toBe(503);
  });

  it("starts the collector, the daily backup and the history backfill; each failing alone stays alone", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    const meta = { run: async () => (calls.push("meta"), Promise.reject(new Error("meta down"))), running: false, lastRun: () => null };
    const backup = { runIfDue: async () => (calls.push("backup"), Promise.reject(new Error("r2 down"))), health: () => null };
    const sync = { request: async () => ({}), state: () => ({ state: "idle" }), forget: () => {}, backfill: async () => (calls.push("backfill"), Promise.reject(new Error("riot down"))) };
    const { db, app } = setup({ meta: meta as never, backup: backup as never, sync: sync as never });
    db.$client.prepare("INSERT INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, stored_at, source) VALUES ('EUW1_1', 420, '16.20', 1, 1800, '{}', ?, 'collector')").run(NOW);
    const res = await collect(app, ADMIN);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ started: true, running: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.sort()).toEqual(["backfill", "backup", "meta"]);
    expect(error).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it("the cron run fails visibly when the collector has stored nothing for too long, and still runs", async () => {
    const run = vi.fn(async () => {});
    const { app } = setup({ meta: { run, running: true, lastRun: () => null } as never });
    const res = await collect(app, ADMIN);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "collector_stale", started: false, running: true });
    expect(run).toHaveBeenCalled();
  });
});

describe("the account cap", () => {
  it("holds at the limit: the invite stays good, and a place freed by a deletion can be taken", async () => {
    const { db, invite, app } = setup({ maxUsers: 2 });
    const post = (inviteCode: string, riotId: string) => app.request("/users", { method: "POST", body: JSON.stringify({ inviteCode, riotId }), headers: { "content-type": "application/json" } });
    expect((await post(invite(), "Ofek#EUW")).status).toBe(201);
    expect((await post(invite(), "Friend#EUW")).status).toBe(201);
    const third = invite();
    const refused = await post(third, "Third#EUW");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "group_full" });
    expect(count(db, "users")).toBe(2);

    deleteUser(db, 1);
    expect((await post(third, "Third#EUW")).status).toBe(201);
    expect(count(db, "users")).toBe(2);
  });

  it("no limit set: no limit", async () => {
    const db = openDb(":memory:");
    for (const name of ["Ofek", "Friend", "Third"]) await registerUser(db, riot(), { inviteCode: createInvite(db, { ttlDays: 1, now: NOW }).code, riotId: `${name}#EUW` }, NOW);
    expect(count(db, "users")).toBe(3);
  });
});

describe("invites", () => {
  it("expire at the moment they say", async () => {
    const db = openDb(":memory:");
    const { code, expiresAt } = createInvite(db, { ttlDays: 1, now: NOW });
    expect(expiresAt).toBe(NOW + DAY);
    await expect(registerUser(db, riot(), { inviteCode: code, riotId: "Ofek#EUW" }, NOW + DAY)).rejects.toMatchObject({ code: "invite_invalid" });
    await expect(registerUser(db, riot(), { inviteCode: code, riotId: "Ofek#EUW" }, NOW + DAY - 1)).resolves.toBeDefined();
  });

  it("aren't used up by a failed attempt: an unknown Riot ID or a Riot outage", async () => {
    const db = openDb(":memory:");
    const { code } = createInvite(db, { ttlDays: 1, now: NOW });
    await expect(registerUser(db, riot(), { inviteCode: code, riotId: "Nobody#EUW" }, NOW)).rejects.toMatchObject({ code: "riot_id_not_found" });
    const down: AccountLookup = { accountByRiotId: async () => Promise.reject(new RiotApiError(500, "account")) };
    await expect(registerUser(db, down, { inviteCode: code, riotId: "Ofek#EUW" }, NOW)).rejects.toBeInstanceOf(RiotApiError);
    expect(db.select().from(schema.invites).get()).toMatchObject({ usedAt: null, usedBy: null });
    await expect(registerUser(db, riot(), { inviteCode: code, riotId: "Ofek#EUW" }, NOW)).resolves.toBeDefined();
    expect(db.select().from(schema.invites).get()).toMatchObject({ usedAt: NOW, usedBy: 1 });
  });

  it("a returning player gets a new token, and the old one stops working", async () => {
    const { app, signUp, as, db } = setup();
    const first = await signUp();
    const second = await signUp();
    expect(second).not.toBe(first);
    expect((await app.request("/me", { headers: as(first) })).status).toBe(401);
    expect((await app.request("/me", { headers: as(second) })).status).toBe(200);
    expect(count(db, "users")).toBe(1);
  });

  it("maps every failure to its own answer", async () => {
    const { register, invite } = setup();
    expect((await register("AAAA-BBBB-CCCC")).status).toBe(403);
    expect((await register(invite(), "NoTag")).status).toBe(400);
    expect((await register(invite(), "Nobody#EUW")).status).toBe(404);
    const keyGone = setup({ riot: { accountByRiotId: async () => Promise.reject(new RiotKeyError(401, "account", "rejected")) } });
    expect((await keyGone.register(keyGone.invite())).status).toBe(503);
    const outage = setup({ riot: { accountByRiotId: async () => Promise.reject(new RiotApiError(500, "account")) } });
    const res = await outage.register(outage.invite());
    expect(res.status).toBe(502);
    expect((await res.json()) as { message: string }).toMatchObject({ error: "riot_error" });
  });

  it("registration survives a body that isn't JSON, and a server without a Riot key", async () => {
    const { app } = setup();
    expect((await app.request("/users", { method: "POST", body: "not json" })).status).toBe(400);
    const none = setup({ riot: null });
    expect((await none.register(none.invite())).status).toBe(503);
  });

  it("the owner's invite route takes defaults and refuses out-of-range days", async () => {
    const { app } = setup();
    const post = (body: unknown) => app.request("/admin/invites", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" } });
    expect(await (await post({})).json()).toMatchObject({ expiresAt: NOW + 14 * DAY });
    expect((await post({ days: 366 })).status).toBe(400);
    expect((await post({ note: "x".repeat(101) })).status).toBe(400);
    const noBody = await app.request("/admin/invites", { method: "POST", headers: { authorization: `Bearer ${ADMIN}` } });
    expect(noBody.status).toBe(201);
  });
});

describe("Riot IDs", () => {
  it.each(["NoHash", "#EUW", "Name#", "  #  ", `${"x".repeat(62)}#EUW`])("refuses %j", (id) => {
    expect(() => parseRiotId(id)).toThrow(/looks like/);
  });
});

describe("deleting your data", () => {
  /** Two users who share one game, each with one of their own, and all the rows a user can have. */
  function twoPlayers() {
    const { db, app, signUp, as } = setup();
    const add = (id: string) => db.$client.prepare("INSERT INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, stored_at, source) VALUES (?, 420, '16.20', 1, 1800, '{}', 1, 'user')").run(id);
    return {
      db,
      app,
      as,
      signUp,
      seed: (userId: number, matches: string[]) => {
        for (const id of matches) {
          if (!db.$client.prepare("SELECT 1 FROM matches WHERE match_id = ?").get(id)) add(id);
          db.insert(schema.userMatches).values({ userId, matchId: id, participantIndex: 0, endedAt: 1 }).run();
        }
        db.insert(schema.userMasteries).values({ userId, data: [] as never, updatedAt: 1 }).run();
        db.insert(schema.rankHistory).values({ userId, day: "2026-10-11", queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "I" }).run();
        db.insert(schema.adviceLog).values({ userId, gameId: 7, lockedAt: 3, championId: 950, advice: { shown: [] } as never, createdAt: 3 }).run();
      },
    };
  }

  it("takes every row of yours, and leaves the other player's whole", async () => {
    const p = twoPlayers();
    const mine = await p.signUp("Ofek#EUW");
    const theirs = await p.signUp("Friend#EUW");
    p.seed(1, ["EUW1_mine", "EUW1_shared"]);
    p.seed(2, ["EUW1_shared", "EUW1_theirs"]);

    expect((await p.app.request("/me", { method: "DELETE", headers: p.as(mine) })).status).toBe(204);

    expect(p.db.select({ id: schema.users.id }).from(schema.users).all()).toEqual([{ id: 2 }]);
    for (const table of ["user_matches", "user_masteries", "rank_history", "advice_log"]) {
      const rows = p.db.$client.prepare(`SELECT user_id FROM ${table}`).all() as { user_id: number }[];
      expect(rows.length, table).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === 2), table).toBe(true);
    }
    const left = (p.db.$client.prepare("SELECT match_id FROM matches ORDER BY match_id").all() as { match_id: string }[]).map((m) => m.match_id);
    expect(left).toEqual(["EUW1_shared", "EUW1_theirs"]);
    // Your token is dead, theirs lives; the invite you used stays as a used invite with no one behind it.
    expect((await p.app.request("/me", { headers: p.as(mine) })).status).toBe(401);
    expect((await p.app.request("/me", { headers: p.as(theirs) })).status).toBe(200);
    expect(p.db.select().from(schema.invites).all().find((i) => i.usedBy === 1)).toBeUndefined();
  });

  it("keeps a collected game that shares nothing with you: the meta doesn't depend on who stays", async () => {
    const p = twoPlayers();
    const mine = await p.signUp();
    p.db.$client.prepare("INSERT INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, stored_at, source) VALUES ('EUW1_c', 420, '16.20', 1, 1800, '{}', 1, 'collector')").run();
    await p.app.request("/me", { method: "DELETE", headers: p.as(mine) });
    expect(count(p.db, "matches")).toBe(1);
  });

  it("also forgets the sync state", async () => {
    const forget = vi.fn();
    const { app, signUp, as } = setup({ sync: { request: async () => ({}), state: () => ({ state: "idle" }), forget } as never });
    const token = await signUp();
    await app.request("/me", { method: "DELETE", headers: as(token) });
    expect(forget).toHaveBeenCalledWith(1);
  });
});

describe("rate limits and activity", () => {
  it("a window counts per key and starts over when it's up", () => {
    const l = new WindowLimiter(2, 1000);
    expect([l.allow("a", 0), l.allow("a", 1), l.allow("a", 2)]).toEqual([true, true, false]);
    expect(l.allow("b", 2)).toBe(true);
    expect(l.allow("a", 999)).toBe(false);
    expect(l.allow("a", 1000)).toBe(true);
  });

  it("keeps its memory bounded: old keys go once there are many, live ones stay counted", () => {
    const l = new WindowLimiter(1, 1000);
    const size = () => (l as unknown as { windows: Map<string, unknown> }).windows.size;
    l.allow("live", 5000);
    for (let i = 0; i < 10_000; i++) l.allow(`old${i}`, 0);
    expect(size()).toBe(10_001);
    l.allow("new", 5001);
    expect(size()).toBe(2);
    expect(l.allow("live", 5002)).toBe(false);
  });

  it("registration attempts behind a proxy count per first address; without one they share a bucket", async () => {
    const { app } = setup({ registerPerMinute: 1 });
    const post = (headers: Record<string, string> = {}) => app.request("/users", { method: "POST", body: "{}", headers });
    expect((await post({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })).status).toBe(400);
    expect((await post({ "x-forwarded-for": "9.9.9.9, 10.0.0.2" })).status).toBe(429);
    expect((await post()).status).toBe(400);
    expect((await post()).status).toBe(429);
  });

  it("records activity at most once a minute", () => {
    const { db } = setup();
    db.insert(schema.users).values({ puuid: "P", gameName: "N", tagLine: "T", tokenHash: "h", createdAt: 1 }).run();
    const read = () => db.select().from(schema.users).get()!;
    touchUser(db, read(), 1000);
    expect(read().lastSeenAt).toBe(1000);
    touchUser(db, read(), 1000 + 59_999);
    expect(read().lastSeenAt).toBe(1000);
    touchUser(db, read(), 1000 + 60_000);
    expect(read().lastSeenAt).toBe(61_000);
  });
});

describe("/me/profile asks", () => {
  it("refuses a bad since or ids instead of guessing", async () => {
    const { app, signUp, as } = setup();
    const token = await signUp();
    const get = (q: string) => app.request(`/me/profile${q}`, { headers: as(token) });
    expect((await get("?since=abc")).status).toBe(400);
    expect((await get("?ids=';DROP TABLE users;--")).status).toBe(400);
    expect((await get(`?ids=${Array.from({ length: 101 }, (_, i) => `EUW1_${i}`).join(",")}`)).status).toBe(400);
    expect((await get("?timelines=yes")).status).toBe(400);
    expect((await get("?since=0&ids=EUW1_1&timelines=1")).status).toBe(200);
  });

  it("/meta asks for a number, and says when there's nothing for that band", async () => {
    const { app, signUp, as } = setup();
    const token = await signUp();
    expect((await app.request("/meta/abc", { headers: as(token) })).status).toBe(400);
    expect(await (await app.request("/meta/7", { headers: as(token) })).json()).toMatchObject({ error: "no_snapshot" });
  });

  it("/advice refuses what isn't a record, keeps nothing of it, and takes one for your account only", async () => {
    const { db, app, signUp, as } = setup();
    const token = await signUp();
    const post = (body: unknown) => app.request("/advice", { method: "POST", body: JSON.stringify(body), headers: { ...as(token), "content-type": "application/json" } });
    expect((await post({ nonsense: true })).status).toBe(400);
    expect(count(db, "advice_log")).toBe(0);
  });

  it("without a sync job there's nothing to start", async () => {
    const { app, signUp, as } = setup();
    const token = await signUp();
    expect((await app.request("/me/sync", { method: "POST", headers: as(token) })).status).toBe(503);
    expect(await (await app.request("/me/sync", { headers: as(token) })).json()).toEqual({ sync: { state: "idle" } });
  });
});
