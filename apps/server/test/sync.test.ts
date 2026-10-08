import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { RiotApiError, RiotKeyError, MatchSchema, type Match } from "@ldc/riot-api";
import { createInvite, deleteUser, registerUser, type User } from "../src/accounts";
import { openDb, schema, type Db } from "../src/db";
import { pruneUserHistory, sortMatchIdsNewestFirst, syncUser, usersDueForSync, type SyncRiot, type SyncSettings } from "../src/sync";
import { SyncScheduler } from "../src/sync-scheduler";
import { findConfigDir, loadServerConfig } from "../src/config";

const NOW = 1_800_000_000_000;
const config = loadServerConfig(findConfigDir(process.cwd()));
const settings = (matchCount = 5, queues = [420]): SyncSettings => ({ history: { matchCount, queues }, bands: config.bands });

/** A Match-V5 payload where `puuids[i]` plays champion 100+i. */
function rawMatch(id: string, puuids: string[], endedAt: number): Match {
  return MatchSchema.parse({
    metadata: { matchId: id },
    info: {
      gameCreation: endedAt - 1_800_000,
      gameDuration: 1800,
      gameEndTimestamp: endedAt,
      gameVersion: "16.19.1",
      queueId: 420,
      participants: Array.from({ length: 10 }, (_, i) => ({
        puuid: puuids[i] ?? `OTHER-${id}-${i}`,
        championId: 100 + i,
        teamId: i < 5 ? 100 : 200,
        teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
        win: i < 5,
        kills: i,
        challenges: { killParticipation: 0.5 },
      })),
    },
  });
}

interface FakeRiot extends SyncRiot {
  calls: string[];
  ids: Record<string, string[]>;
  store: Map<string, Match>;
  /** Riot ID -> PUUID for Account-V1. */
  accounts: Record<string, string>;
  /** PUUIDs from another API key: Riot answers HTTP 400. */
  foreign: Set<string>;
}

function fakeRiot(): FakeRiot {
  const calls: string[] = [];
  const ids: Record<string, string[]> = {};
  const store = new Map<string, Match>();
  const accounts: Record<string, string> = {};
  const foreign = new Set<string>();
  return {
    calls,
    ids,
    store,
    accounts,
    foreign,
    async accountByRiotId(gameName, tagLine) {
      calls.push(`account:${gameName}#${tagLine}`);
      const puuid = accounts[`${gameName}#${tagLine}`];
      return puuid ? { puuid, gameName, tagLine } : null;
    },
    async masteriesByPuuid(puuid) {
      calls.push(`mastery:${puuid}`);
      if (foreign.has(puuid)) throw new RiotApiError(400, "champion-mastery-v4.by-puuid");
      return [{ championId: 103, championLevel: 7, championPoints: 120_000, milestoneGrades: ["S"] }];
    },
    async leagueEntriesByPuuid(puuid) {
      calls.push(`league:${puuid}`);
      return [{ queueType: "RANKED_SOLO_5x5", tier: "EMERALD", rank: "IV", wins: 10, losses: 8 }];
    },
    async matchIdsByPuuid(puuid, query = {}) {
      calls.push(`ids:${puuid}:${query.queue}:${query.start}:${query.count}`);
      const all = ids[puuid] ?? [];
      return all.slice(query.start ?? 0, (query.start ?? 0) + (query.count ?? 20));
    },
    async match(id) {
      calls.push(`match:${id}`);
      return store.get(id) ?? null;
    },
  };
}

async function newUser(db: Db, riotId: string, puuid: string): Promise<User> {
  const code = createInvite(db, { ttlDays: 1, now: NOW }).code;
  const account = { accountByRiotId: async (gameName: string, tagLine: string) => ({ puuid, gameName, tagLine }) };
  return (await registerUser(db, account, { inviteCode: code, riotId }, NOW)).user;
}

/** Adds `n` matches for `puuid` as participant 2 (mid), newest first. */
function seed(riot: FakeRiot, puuid: string, n: number, offset = 0) {
  const list: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `EUW1_${1000 - offset - i}`;
    riot.store.set(id, riot.store.get(id) ?? rawMatch(id, ["a", "b", puuid], NOW - (offset + i) * 3_600_000));
    list.push(id);
  }
  riot.ids[puuid] = [...list, ...(riot.ids[puuid] ?? [])];
}

describe("syncUser", () => {
  it("stores matches anonymised, with the user's participant index, mastery, ranked and band", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-OFEK");
    seed(riot, "PUUID-OFEK", 3);

    const r = await syncUser(db, riot, user, settings(), NOW);
    expect(r).toEqual({ newMatches: 3, totalMatches: 3, band: 3 });

    const links = db.select().from(schema.userMatches).all();
    expect(links.map((l) => l.participantIndex)).toEqual([2, 2, 2]);
    const stored = db.select().from(schema.matches).all();
    expect(stored).toHaveLength(3);
    expect(stored[0]?.summary.participants[2]).toMatchObject({ championId: 102, position: "middle", challenges: { killParticipation: 0.5 } });
    expect(JSON.stringify(stored)).not.toMatch(/PUUID|OTHER-/);

    const saved = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
    expect(saved).toMatchObject({ band: 3, lastSyncAt: NOW, ranked: [{ queueType: "RANKED_SOLO_5x5", tier: "EMERALD", rank: "IV" }] });
    expect(db.select().from(schema.userMasteries).get()?.data).toEqual([{ championId: 103, level: 7, points: 120_000, grades: ["S"] }]);
  });

  it("only fetches matches it doesn't have yet", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-OFEK");
    seed(riot, "PUUID-OFEK", 3, 1);
    await syncUser(db, riot, user, settings(), NOW);
    seed(riot, "PUUID-OFEK", 1, 0);
    riot.calls.length = 0;

    const r = await syncUser(db, riot, user, settings(), NOW + 1);
    expect(r.newMatches).toBe(1);
    expect(riot.calls.filter((c) => c.startsWith("match:"))).toEqual(["match:EUW1_1000"]);
  });

  it("pages match ids past 100 per call across queues and keeps the newest matchCount", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-OFEK");
    seed(riot, "PUUID-OFEK", 150);
    const r = await syncUser(db, riot, user, settings(120, [420, 440]), NOW);
    expect(riot.calls.filter((c) => c.startsWith("ids:"))).toEqual([
      "ids:PUUID-OFEK:420:0:100",
      "ids:PUUID-OFEK:420:100:20",
      "ids:PUUID-OFEK:440:0:100",
      "ids:PUUID-OFEK:440:100:20",
    ]);
    expect(r.totalMatches).toBe(120);
  });

  it("shares a match two friends played together, each with their own index", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const a = await newUser(db, "A#EUW", "PUUID-A");
    const b = await newUser(db, "B#EUW", "PUUID-B");
    riot.store.set("EUW1_1", rawMatch("EUW1_1", ["PUUID-A", "x", "y", "PUUID-B"], NOW));
    riot.ids["PUUID-A"] = ["EUW1_1"];
    riot.ids["PUUID-B"] = ["EUW1_1"];
    await syncUser(db, riot, a, settings(), NOW);
    await syncUser(db, riot, b, settings(), NOW);
    expect(db.select().from(schema.matches).all()).toHaveLength(1);
    expect(db.select().from(schema.userMatches).all().map((l) => [l.userId, l.participantIndex])).toEqual([[a.id, 0], [b.id, 3]]);

    deleteUser(db, a.id);
    expect(db.select().from(schema.matches).all()).toHaveLength(1); // B still links to it
    deleteUser(db, b.id);
    expect(db.select().from(schema.matches).all()).toHaveLength(0);
    expect(db.select().from(schema.userMasteries).all()).toHaveLength(0);
  });

  it("looks the user up again by Riot ID when the API key changed (PUUIDs are per key)", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-DEVKEY");
    riot.foreign.add("PUUID-DEVKEY");
    riot.accounts["Ofek#EUW"] = "PUUID-NEWKEY";
    seed(riot, "PUUID-NEWKEY", 2);

    expect((await syncUser(db, riot, user, settings(), NOW)).newMatches).toBe(2);
    expect(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()?.puuid).toBe("PUUID-NEWKEY");
    expect(db.select().from(schema.userMatches).all().map((l) => l.participantIndex)).toEqual([2, 2]);
  });

  it("keeps the user only when the account found by Riot ID played the user's stored games", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-DEVKEY");
    seed(riot, "PUUID-DEVKEY", 3);
    await syncUser(db, riot, user, settings(), NOW);
    riot.foreign.add("PUUID-DEVKEY");

    // Someone else took the Riot ID: their games share nothing with the stored ones.
    riot.accounts["Ofek#EUW"] = "PUUID-STRANGER";
    seed(riot, "PUUID-STRANGER", 2, 500);
    await expect(syncUser(db, riot, user, settings(), NOW)).rejects.toThrow(/different Riot account/);
    expect(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()?.puuid).toBe("PUUID-DEVKEY");

    // The same player under the new key: their newest games include the stored ones.
    riot.accounts["Ofek#EUW"] = "PUUID-NEWKEY";
    riot.ids["PUUID-NEWKEY"] = [...riot.ids["PUUID-DEVKEY"]!];
    seed(riot, "PUUID-NEWKEY", 1, -1);
    expect((await syncUser(db, riot, user, settings(), NOW)).newMatches).toBe(1);
    expect(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()?.puuid).toBe("PUUID-NEWKEY");
  });

  it("fails with a clear error when the new PUUID already belongs to another user", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-DEVKEY");
    await newUser(db, "Again#EUW", "PUUID-NEWKEY");
    riot.foreign.add("PUUID-DEVKEY");
    riot.accounts["Ofek#EUW"] = "PUUID-NEWKEY";
    await expect(syncUser(db, riot, user, settings(), NOW)).rejects.toThrow(/registered again/);
  });

  it("still fails on a rejected PUUID when the Riot ID can't be found", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-DEVKEY");
    riot.foreign.add("PUUID-DEVKEY");
    await expect(syncUser(db, riot, user, settings(), NOW)).rejects.toMatchObject({ status: 400 });
  });

  it("skips matches where the user isn't found", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-OFEK");
    riot.store.set("EUW1_9", rawMatch("EUW1_9", ["someone-else"], NOW));
    riot.ids["PUUID-OFEK"] = ["EUW1_9", "EUW1_8"]; // EUW1_8 is a 404
    expect((await syncUser(db, riot, user, settings(), NOW)).newMatches).toBe(0);
  });
});

describe("history housekeeping", () => {
  it("sorts match ids newest first and dedupes", () => {
    expect(sortMatchIdsNewestFirst(["EUW1_5", "EUW1_10", "EUW1_5", "EUW1_7"])).toEqual(["EUW1_10", "EUW1_7", "EUW1_5"]);
  });

  it("prunes a user's history to the newest N and removes unreferenced matches", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-OFEK");
    seed(riot, "PUUID-OFEK", 5);
    await syncUser(db, riot, user, settings(), NOW);
    pruneUserHistory(db, user.id, 2);
    expect(db.select().from(schema.userMatches).all().map((l) => l.matchId).sort()).toEqual(["EUW1_1000", "EUW1_999"]);
    expect(db.select().from(schema.matches).all()).toHaveLength(2);
  });

  it("picks users who were active recently and are stale", async () => {
    const db = openDb(":memory:");
    const fresh = await newUser(db, "A#EUW", "PA");
    const stale = await newUser(db, "B#EUW", "PB");
    const away = await newUser(db, "C#EUW", "PC");
    db.update(schema.users).set({ lastSeenAt: NOW, lastSyncAt: NOW }).where(eq(schema.users.id, fresh.id)).run();
    db.update(schema.users).set({ lastSeenAt: NOW, lastSyncAt: NOW - 3_600_000 }).where(eq(schema.users.id, stale.id)).run();
    db.update(schema.users).set({ lastSeenAt: NOW - 30 * 86_400_000 }).where(eq(schema.users.id, away.id)).run();
    expect(usersDueForSync(db, NOW, 1_800_000, 14 * 86_400_000).map((u) => u.id)).toEqual([stale.id]);
  });
});

describe("SyncScheduler", () => {
  it("joins concurrent requests for the same user and reports progress", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const user = await newUser(db, "Ofek#EUW", "PUUID-OFEK");
    seed(riot, "PUUID-OFEK", 2);
    const s = new SyncScheduler(db, riot, settings(), { tickMs: 1e9, staleAfterMs: 1, activeWithinMs: 1e9, now: () => NOW, log: () => {} });
    const [r1, r2] = await Promise.all([s.request(user.id), s.request(user.id)]);
    expect(r1).toBe(r2);
    expect(riot.calls.filter((c) => c.startsWith("match:"))).toHaveLength(2);
    expect(s.state(user.id)).toMatchObject({ state: "done", result: { newMatches: 2 } });
  });

  it("records errors and stops a background pass when the Riot key is rejected", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    riot.masteriesByPuuid = async () => {
      throw new RiotKeyError(403, "mastery", "key rejected");
    };
    const a = await newUser(db, "A#EUW", "PA");
    const b = await newUser(db, "B#EUW", "PB");
    db.update(schema.users).set({ lastSeenAt: NOW }).run();
    const logs: string[] = [];
    const s = new SyncScheduler(db, riot, settings(), { tickMs: 1e9, staleAfterMs: 1, activeWithinMs: 1e9, now: () => NOW, log: (m) => logs.push(m) });
    await s.tick();
    expect(s.state(a.id)).toMatchObject({ state: "error", message: "key rejected" });
    expect(s.state(b.id)).toEqual({ state: "idle" });
    expect(logs).toHaveLength(1);
  });
});
