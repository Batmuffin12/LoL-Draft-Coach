import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { MatchSchema, RiotApiError, RiotKeyError, type Match } from "@ldc/riot-api";
import { deleteUser } from "../src/accounts";
import { findConfigDir, loadServerConfig } from "../src/config";
import { openDb, schema, type Db } from "../src/db";
import type { SyncRiot } from "../src/sync";
import { recentlyFailed, SYNC_FAILURE_COOLDOWN_MS, SyncScheduler } from "../src/sync-scheduler";

const NOW = 1_800_000_000_000;
const config = loadServerConfig(findConfigDir(process.cwd()));
const settings = { history: { matchCount: 5, queues: [420], timelineCount: 0 }, bands: config.bands };

function rawMatch(id: string, puuid: string): Match {
  return MatchSchema.parse({
    metadata: { matchId: id },
    info: {
      gameCreation: NOW - 1_800_000,
      gameDuration: 1800,
      gameEndTimestamp: NOW,
      gameVersion: "16.19.1",
      queueId: 420,
      participants: Array.from({ length: 10 }, (_, i) => ({ puuid: i === 2 ? puuid : `OTHER-${i}`, championId: 100 + i, teamId: i < 5 ? 100 : 200, teamPosition: "MIDDLE", win: i < 5 })),
    },
  });
}

/** A Riot API where each player has one game; `fail` decides who it fails for, and how. */
function fakeRiot(fail: (puuid: string) => Error | null = () => null): SyncRiot & { synced: string[] } {
  const synced: string[] = [];
  return {
    synced,
    async accountByRiotId(gameName, tagLine) {
      return { puuid: `P-${gameName}`, gameName, tagLine };
    },
    async masteriesByPuuid(puuid) {
      synced.push(puuid);
      const err = fail(puuid);
      if (err) throw err;
      return [];
    },
    async leagueEntriesByPuuid() {
      return [];
    },
    async matchIdsByPuuid(puuid) {
      return [`EUW1_${puuid}`];
    },
    async match(id) {
      return rawMatch(id, id.replace("EUW1_", ""));
    },
  };
}

function addUser(db: Db, name: string, over: Partial<typeof schema.users.$inferInsert> = {}) {
  return db.insert(schema.users).values({ puuid: `P-${name}`, gameName: name, tagLine: "EUW", tokenHash: name, createdAt: NOW, ...over }).returning().get();
}

const make = (riot: SyncRiot, over: Partial<ConstructorParameters<typeof SyncScheduler>[3]> = {}) => {
  const db = openDb(":memory:");
  const logs: string[] = [];
  const s = new SyncScheduler(db, riot, settings, { tickMs: 1000, staleAfterMs: 1000, activeWithinMs: 1e12, now: () => NOW, log: (m) => logs.push(m), ...over });
  return { db, s, logs };
};

afterEach(() => vi.useRealTimers());

describe("the failure cooldown", () => {
  it("lasts exactly its length, and only for a failure", () => {
    const failed = { state: "error", message: "x", finishedAt: NOW } as const;
    expect(recentlyFailed(failed, NOW + SYNC_FAILURE_COOLDOWN_MS - 1)).toBe(true);
    expect(recentlyFailed(failed, NOW + SYNC_FAILURE_COOLDOWN_MS)).toBe(false);
    expect(recentlyFailed({ state: "idle" }, NOW)).toBe(false);
  });
});

describe("the history backfill (inside the hourly wake-up)", () => {
  it("only takes users whose history is still loading, with the wake's budget", async () => {
    const riot = fakeRiot();
    const { db, s, logs } = make(riot);
    addUser(db, "Loading", { historyBacklog: 3 });
    addUser(db, "Fresh", { historyBacklog: null });
    addUser(db, "Done", { historyBacklog: 0 });
    await s.backfill();
    expect(riot.synced.sort()).toEqual(["P-Fresh", "P-Loading"]);
    expect(logs.filter((l) => l.startsWith("backfill:"))).toHaveLength(2);
  });

  it("goes on after one user's ordinary failure", async () => {
    const riot = fakeRiot((p) => (p === "P-A" ? new RiotApiError(500, "x") : null));
    const { db, s } = make(riot);
    addUser(db, "A");
    addUser(db, "B");
    await expect(s.backfill()).resolves.toBeUndefined();
    expect(riot.synced).toEqual(["P-A", "P-B"]);
    expect(s.state(1).state).toBe("error");
    expect(s.state(2).state).toBe("done");
  });

  it("stops at a rejected key: every other call would fail too", async () => {
    const riot = fakeRiot(() => new RiotKeyError(401, "x", "rejected"));
    const { db, s } = make(riot);
    addUser(db, "A");
    addUser(db, "B");
    await s.backfill();
    expect(riot.synced).toEqual(["P-A"]);
  });
});

describe("the background loop", () => {
  it("syncs who's due, skips who just failed, and says what came in", async () => {
    const riot = fakeRiot();
    const { db, s, logs } = make(riot);
    const due = addUser(db, "Due", { lastSeenAt: NOW });
    addUser(db, "Fresh", { lastSeenAt: NOW, lastSyncAt: NOW });
    await s.tick();
    expect(riot.synced).toEqual(["P-Due"]);
    expect(logs.some((l) => l.includes(`user ${due.id} +1 matches`))).toBe(true);
  });

  it("leaves a user alone during the cooldown, and tries again after it", async () => {
    let now = NOW;
    const riot = fakeRiot(() => new RiotApiError(500, "x"));
    const { db, s } = make(riot, { now: () => now });
    addUser(db, "A", { lastSeenAt: NOW });
    await s.tick();
    await s.tick();
    expect(riot.synced).toHaveLength(1);
    now += SYNC_FAILURE_COOLDOWN_MS;
    await s.tick();
    expect(riot.synced).toHaveLength(2);
  });

  it("stops the pass at a rejected key", async () => {
    const riot = fakeRiot(() => new RiotKeyError(401, "x", "rejected"));
    const { db, s } = make(riot);
    addUser(db, "A", { lastSeenAt: NOW });
    addUser(db, "B", { lastSeenAt: NOW });
    await s.tick();
    expect(riot.synced).toHaveLength(1);
  });

  it("one pass at a time", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const riot = fakeRiot();
    const masteries = riot.masteriesByPuuid.bind(riot);
    riot.masteriesByPuuid = async (p, ...rest) => {
      await gate;
      return masteries(p, ...rest);
    };
    const { db, s } = make(riot);
    addUser(db, "A", { lastSeenAt: NOW });
    const first = s.tick();
    await s.tick();
    release();
    await first;
    expect(riot.synced).toEqual(["P-A"]);
  });

  it("start runs at once and on its interval, once; stop ends it", async () => {
    vi.useFakeTimers();
    const { s } = make(fakeRiot());
    const tick = vi.spyOn(s, "tick").mockResolvedValue();
    s.start();
    s.start();
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(2);
    s.stop();
  });
});

describe("a sync while the user goes", () => {
  it("asks for a user who doesn't exist: refused, not run", async () => {
    const riot = fakeRiot();
    const { s } = make(riot);
    await expect(s.request(99)).rejects.toThrow(/No user 99/);
    expect(riot.synced).toEqual([]);
    expect(s.state(99)).toEqual({ state: "idle" });
  });

  it("joins a sync already running instead of starting another", async () => {
    const riot = fakeRiot();
    const { db, s } = make(riot);
    const u = addUser(db, "A");
    expect(s.request(u.id)).toBe(s.request(u.id));
    await s.request(u.id);
    expect(riot.synced).toEqual(["P-A"]);
  });

  it("a user deleted mid-sync leaves nothing behind: no user, no links, no games, no error state", async () => {
    const riot = fakeRiot();
    const { db, s, logs } = make(riot);
    const u = addUser(db, "A");
    const match = riot.match.bind(riot);
    riot.match = async (id: string) => {
      deleteUser(db, u.id);
      s.forget(u.id);
      return match(id);
    };
    await s.request(u.id).catch(() => {});
    expect(db.select().from(schema.users).where(eq(schema.users.id, u.id)).all()).toEqual([]);
    expect(db.select().from(schema.userMatches).all()).toEqual([]);
    expect(db.select().from(schema.matches).all()).toEqual([]);
    expect(s.state(u.id).state).not.toBe("error");
    expect(logs.filter((l) => l.startsWith(`sync: user ${u.id} failed`))).toEqual([]);
  });
});
