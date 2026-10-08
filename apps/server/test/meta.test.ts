import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MatchSchema, TimelineSchema, RiotApiError, RiotKeyError, type LeaguePlayer, type Match } from "@ldc/riot-api";
import type { MetaSnapshot } from "@ldc/shared";
import { createApp } from "../src/app";
import { sha256 } from "../src/auth";
import { collect, nextCursor, pruneCollected, type CollectorRiot, type CollectOptions } from "../src/collector";
import { findConfigDir, loadServerConfig } from "../src/config";
import { openDb, schema, type Db } from "../src/db";
import { activeBands, buildBandsFor, challengeFields, MetaJob, publishSnapshot } from "../src/meta-job";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const config = loadServerConfig(findConfigDir(process.cwd()));
const settings = { meta: config.meta, bands: config.bands, engine: config.engine };

/** Ten players; champion 100+i; blue (first five) wins. */
function rawMatch(id: string, endedAt: number, queueId = 420): Match {
  return MatchSchema.parse({
    metadata: { matchId: id },
    info: {
      gameCreation: endedAt - 1_800_000,
      gameDuration: 1800,
      gameEndTimestamp: endedAt,
      gameVersion: "16.19.1",
      queueId,
      participants: Array.from({ length: 10 }, (_, i) => ({
        puuid: `SECRET-${id}-${i}`,
        riotIdGameName: `Name${i}`,
        championId: 100 + i,
        teamId: i < 5 ? 100 : 200,
        teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
        win: i < 5,
        challenges: { killParticipation: 0.5, someUnusedChallenge: 3 },
      })),
    },
  });
}

interface Fake extends CollectorRiot {
  calls: string[];
}

/** Each League-V4 page has `perPage` players until `pages`; each player has 2 games, the second shared with the next player. */
function fakeRiot(opts: { pages?: number; perPage?: number; failFor?: string; keyError?: boolean } = {}): Fake {
  const calls: string[] = [];
  const pages = opts.pages ?? 2;
  const perPage = opts.perPage ?? 3;
  return {
    calls,
    async leaguePlayers(q) {
      calls.push(`league:${q.tier}:${q.division}:${q.page}`);
      if (opts.keyError) throw new RiotKeyError(401, "league", "rejected");
      if (q.page > pages) return [];
      const list = Array.from({ length: perPage }, (_, i): LeaguePlayer => ({ puuid: `P-${q.tier}-${q.division}-${q.page}-${i}`, queueType: q.queue, tier: q.tier }));
      return [{ puuid: "P-INACTIVE", queueType: q.queue, tier: q.tier, inactive: true }, ...list];
    },
    async matchIdsByPuuid(puuid, query = {}) {
      calls.push(`ids:${puuid}:${query.queue}:${query.count}:${query.startTime}`);
      if (puuid === opts.failFor) throw new RiotApiError(500, "ids");
      return [`EUW1_${puuid}-a`, `EUW1_${puuid}-b`];
    },
    async match(id) {
      calls.push(`match:${id}`);
      return rawMatch(id, NOW - 5 * MIN);
    },
    async timeline(id) {
      calls.push(`timeline:${id}`);
      return TimelineSchema.parse({
        metadata: { matchId: id },
        info: {
          participants: Array.from({ length: 10 }, (_, i) => ({ participantId: i + 1, puuid: `SECRET-${id}-${i}` })),
          frames: [
            {
              timestamp: 0,
              participantFrames: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { participantId: i + 1, totalGold: 500 }])),
              events: [{ type: "ITEM_PURCHASED", timestamp: 1000, participantId: 1, itemId: 1055 }],
            },
          ],
        },
      });
    },
  };
}

function options(over: Partial<CollectOptions["collector"]> = {}, now = () => NOW): CollectOptions {
  return {
    bands: [2],
    bandConfig: config.bands,
    collector: { ...config.meta.collector, ...over },
    keepChallenges: challengeFields(config.engine),
    now,
    deadline: NOW + 60_000,
    since: NOW - 30 * 86_400_000,
    random: () => 0,
  };
}

const collected = (db: Db) => db.select().from(schema.matches).all();

function addUser(db: Db, token: string, band: number | null) {
  return db
    .insert(schema.users)
    .values({ puuid: `U-${token}`, gameName: "Me", tagLine: "EUW", tokenHash: sha256(token), createdAt: NOW, band })
    .returning()
    .get();
}

describe("collector", () => {
  it("stores anonymised, band-tagged matches inside the match budget, with only the challenges the engine reads", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const r = await collect(db, riot, options({ maxMatchesPerRun: 4 }));
    expect(r.newMatches).toBe(4);
    expect(r.timelines).toBe(4);
    expect(r.perBand).toEqual({ 2: 4 });
    const rows = collected(db);
    expect(rows).toHaveLength(4);
    expect(rows.every((m) => m.band === 2 && m.source === "collector")).toBe(true);
    const text = JSON.stringify(rows);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("Name0");
    expect(rows[0]!.summary.participants[0]!.challenges).toEqual({ killParticipation: 0.5 });
    expect(rows[0]!.summary.timeline).toEqual({ gold: Array.from({ length: 10 }, () => [500]), items: [[0, 1, 0, 1055]], skills: Array.from({ length: 10 }, () => []), kills: [], wards: [], monsters: [] });
    // Players' identifiers are never stored anywhere.
    const dump = JSON.stringify(db.$client.prepare("SELECT * FROM collector_cursors").all());
    expect(dump).not.toContain("P-");
    expect(riot.calls.some((c) => c.includes("P-INACTIVE"))).toBe(false);
    expect(riot.calls.filter((c) => c.startsWith("ids:")).every((c) => c.endsWith(`:420:${config.meta.collector.matchesPerPlayer}:${(NOW - 30 * 86_400_000) / 1000}`))).toBe(true);
  });

  it("rotates through every tier and division page by page, and continues from the cursor next run", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot({ perPage: 1 });
    // Each page: one player with 2 new games. 6 matches = 3 pages.
    await collect(db, riot, options({ maxMatchesPerRun: 6 }));
    await collect(db, riot, options({ maxMatchesPerRun: 2 }));
    const tiers = config.bands.bands.find((b) => b.id === 2)!.tiers;
    const divisions = config.meta.collector.divisions;
    expect(riot.calls.filter((c) => c.startsWith("league:"))).toEqual([
      `league:${tiers[0]}:${divisions[0]}:1`,
      `league:${tiers[0]}:${divisions[1]}:1`,
      `league:${tiers[0]}:${divisions[2]}:1`,
      `league:${tiers[0]}:${divisions[3]}:1`,
    ]);
    expect(nextCursor({ tierIndex: tiers.length - 1, divisionIndex: divisions.length - 1, page: 4 }, tiers.length, divisions.length)).toEqual({
      tierIndex: 0,
      divisionIndex: 0,
      page: 5,
    });
  });

  it("fetches timelines only for timelineShare of the games", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const r = await collect(db, riot, { ...options({ maxMatchesPerRun: 4, timelineShare: 0.5 }), random: () => 0.7 });
    expect(r.timelines).toBe(0);
    expect(riot.calls.some((c) => c.startsWith("timeline:"))).toBe(false);
    expect(collected(db).every((m) => m.summary.timeline === undefined)).toBe(true);
  });

  it("always fetches timelines in the build-only band, and never for remakes", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot();
    const opts = { ...options({ maxMatchesPerRun: 10, buildBandShare: 0.3, timelineShare: 0.5, buildBandTimelineShare: 1 }), buildBands: [3 as const], random: () => 0.7 };
    await collect(db, riot, opts);
    const rows = collected(db);
    expect(rows.filter((m) => m.band === 3).every((m) => m.summary.timeline !== undefined)).toBe(true);
    expect(rows.filter((m) => m.band === 2).every((m) => m.summary.timeline === undefined)).toBe(true);

    const db2 = openDb(":memory:");
    const riot2 = fakeRiot();
    await collect(db2, riot2, { ...options({ maxMatchesPerRun: 4, timelineShare: 1 }), minDurationSec: 3600 });
    expect(riot2.calls.some((c) => c.startsWith("timeline:"))).toBe(false);
  });

  it("gives the band above its share of the budget, for builds", async () => {
    const db = openDb(":memory:");
    const r = await collect(db, fakeRiot(), { ...options({ maxMatchesPerRun: 10, buildBandShare: 0.3 }), buildBands: [3] });
    // A player's new games are stored together, so a band can go one player over its share.
    expect(r.perBand[2]).toBeGreaterThanOrEqual(7);
    expect(r.perBand[3]).toBeGreaterThanOrEqual(3);
    expect(r.perBand[3]).toBeLessThan(r.perBand[2]!);
    expect(buildBandsFor([2], config.bands)).toEqual([3]);
    expect(buildBandsFor([2, 3], config.bands)).toEqual([4]);
    expect(buildBandsFor([4], config.bands)).toEqual([]);
  });

  it("shares the time budget too, so a slow run still reaches the band above", async () => {
    const db = openDb(":memory:");
    let t = NOW;
    const r = await collect(db, fakeRiot(), { ...options({ maxMatchesPerRun: 100, buildBandShare: 0.3 }, () => (t += 1_000)), deadline: NOW + 60_000, buildBands: [3] });
    expect(r.perBand[3]).toBeGreaterThan(0);
    expect(r.perBand[2]).toBeGreaterThan(r.perBand[3]!);
  });

  it("stops at the deadline", async () => {
    const db = openDb(":memory:");
    let t = NOW;
    const r = await collect(db, fakeRiot(), { ...options({}, () => (t += 20_000)), deadline: NOW + 50_000 });
    expect(r.newMatches).toBeLessThanOrEqual(2);
  });

  it("starts over at page 1 when every list has ended", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot({ pages: 0 });
    const r = await collect(db, riot, options());
    expect(r.newMatches).toBe(0);
    expect(db.select().from(schema.collectorCursors).get()).toMatchObject({ tierIndex: 0, divisionIndex: 0, page: 1 });
  });

  it("skips matches it already has, and tags a user's stored match with the band", async () => {
    const db = openDb(":memory:");
    const riot = fakeRiot({ perPage: 1 });
    const id = "EUW1_P-GOLD-I-1-0-a";
    db.insert(schema.matches)
      .values({ matchId: id, queueId: 420, gameVersion: "16.19", endedAt: NOW, durationSec: 1800, summary: { matchId: id } as never, source: "user", storedAt: NOW })
      .run();
    await collect(db, riot, options({ maxMatchesPerRun: 1 }));
    expect(riot.calls).not.toContain(`match:${id}`);
    expect(db.select().from(schema.matches).where(eq(schema.matches.matchId, id)).get()?.band).toBe(2);
  });

  it("skips a player whose call fails, but stops on a rejected key", async () => {
    const db = openDb(":memory:");
    const ok = await collect(db, fakeRiot({ failFor: "P-GOLD-I-1-0" }), options({ maxMatchesPerRun: 2 }));
    expect(ok.newMatches).toBe(2);
    await expect(collect(openDb(":memory:"), fakeRiot({ keyError: true }), options())).rejects.toBeInstanceOf(RiotKeyError);
  });

  it("prunes old and surplus collected matches, never ones in a user's history", () => {
    const db = openDb(":memory:");
    const user = addUser(db, "t", 2);
    const add = (id: string, endedAt: number) =>
      db.insert(schema.matches).values({ matchId: id, queueId: 420, gameVersion: "16.19", endedAt, durationSec: 1800, summary: { matchId: id } as never, source: "collector", storedAt: NOW, band: 2 }).run();
    add("old", NOW - 100 * 86_400_000);
    add("a", NOW - 3);
    add("b", NOW - 2);
    add("c", NOW - 1);
    add("mine", NOW - 10);
    db.insert(schema.userMatches).values({ userId: user.id, matchId: "mine", participantIndex: 0, endedAt: NOW - 10 }).run();
    const removed = pruneCollected(db, 2, { windowDays: 30, maxStoredMatches: 2, now: NOW });
    expect(removed).toBe(2);
    expect(collected(db).map((m) => m.matchId).sort()).toEqual(["b", "c", "mine"]);
  });
});

describe("meta job", () => {
  it("collects for the bands users play in, then publishes a gzipped snapshot per band", async () => {
    const db = openDb(":memory:");
    addUser(db, "a", 2);
    addUser(db, "b", 2);
    expect(activeBands(db, config.bands)).toEqual([2]);
    const away = addUser(db, "c", 3);
    db.update(schema.users).set({ lastSeenAt: NOW - 90 * 86_400_000 }).where(eq(schema.users.id, away.id)).run();
    expect(activeBands(db, config.bands)).toEqual([2, 3]);
    expect(activeBands(db, config.bands, NOW - 30 * 86_400_000)).toEqual([2]);
    db.delete(schema.users).where(eq(schema.users.id, away.id)).run();
    // Item 1055 counts as a completed item in this catalog.
    const items = async () => new Map([[1055, { id: 1055, name: "X", iconUrl: "", gold: 3000, into: [], from: [], tags: [], maps: ["11"], purchasable: true, requiredChampion: null, stats: {} }]]);
    const job = new MetaJob(db, fakeRiot(), settings, { now: () => NOW, log: () => {}, random: () => 0, items });
    const r = await job.run();
    expect(r.error).toBeNull();
    expect(r.collected?.newMatches).toBeGreaterThan(0);
    // Band 3 is collected for builds only: no snapshot of its own.
    expect(r.collected?.perBand[3]).toBeGreaterThan(0);
    expect(r.snapshots).toEqual([expect.objectContaining({ band: 2, matches: r.collected!.perBand[2], patch: "16.19" })]);
    const row = db.select().from(schema.metaSnapshots).get()!;
    const snap = JSON.parse(gunzipSync(row.body).toString()) as MetaSnapshot;
    expect(snap.champions.length).toBe(10);
    // Builds come from band 2 and the band above; champion 100 bought item 1055 first in every game.
    const build = snap.builds!.find((b) => b.championId === 100)!;
    expect(build.n).toBe(r.collected!.newMatches);
    expect(build.items[0]).toMatchObject({ itemId: 1055, slot: 1, share: 1 });
    expect(snap.traitCuts).toBeDefined();
    expect(snap.expectedWin?.winRate.length).toBeGreaterThan(0);
    expect(job.lastRun()).toMatchObject({ newMatches: r.collected!.newMatches, error: null });
  });

  it("uses the default band when nobody is registered, and still publishes when the key is rejected", async () => {
    const db = openDb(":memory:");
    expect(activeBands(db, config.bands)).toEqual([config.bands.defaultBand]);
    const r = await new MetaJob(db, { ...fakeRiot(), keyProblem: new Error("x") }, settings, { now: () => NOW, log: () => {} }).run();
    expect(r.error).toMatch(/rejected/);
    expect(r.snapshots).toHaveLength(1);
  });

  it("closes a run the server never finished (a redeploy mid-run) before the next one", async () => {
    const db = openDb(":memory:");
    db.insert(schema.collectorRuns).values({ startedAt: NOW - 3_600_000 }).run();
    const job = new MetaJob(db, fakeRiot(), settings, { now: () => NOW, log: () => {} });
    await job.run();
    const runs = db.select().from(schema.collectorRuns).all();
    expect(runs[0]).toMatchObject({ finishedAt: NOW, error: expect.stringMatching(/interrupted/) });
    expect(runs[1]).toMatchObject({ finishedAt: NOW, error: null });
  });

  it("runs one wake-up at a time", async () => {
    const db = openDb(":memory:");
    const job = new MetaJob(db, fakeRiot(), settings, { now: () => NOW, log: () => {} });
    const [a, b] = [job.run(), job.run()];
    expect(a).toBe(b);
    await a;
    expect(job.running).toBe(false);
  });
});

describe("meta routes", () => {
  const ADMIN = "x".repeat(40);

  function setup() {
    const db = openDb(":memory:");
    addUser(db, "tok", 2);
    const job = new MetaJob(db, fakeRiot(), settings, { now: () => NOW, log: () => {} });
    const app = createApp({
      db,
      version: "test",
      riot: null,
      adminToken: ADMIN,
      meta: job,
      publicConfig: { engine: config.engine },
      now: () => NOW,
    });
    return { db, app, job };
  }
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("aggregates every game across read chunks, even when many end at the same time", async () => {
    const { db } = setup();
    const { summarizeMatch } = await import("@ldc/riot-api");
    const insert = db.$client.prepare("INSERT INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, source, stored_at, band) VALUES (?, 420, '16.19.1', ?, 1800, ?, 'collector', ?, 2)");
    db.$client.transaction(() => {
      for (let i = 0; i < 1203; i++) insert.run(`m${i}`, NOW - MIN, JSON.stringify(summarizeMatch(rawMatch(`m${i}`, NOW - MIN))), NOW);
    })();
    expect((await publishSnapshot(db, 2, settings, NOW)).matches).toBe(1203);
  });

  it("serves the band snapshot to registered users only, gzipped with an ETag", async () => {
    const { db, app } = setup();
    expect((await app.request("/meta/2")).status).toBe(401);
    expect((await app.request("/meta/2", { headers: auth("tok") })).status).toBe(404);

    db.insert(schema.matches)
      .values({ matchId: "m", queueId: 420, gameVersion: "16.19.1", endedAt: NOW - MIN, durationSec: 1800, summary: (await import("@ldc/riot-api")).summarizeMatch(rawMatch("m", NOW - MIN)), source: "collector", storedAt: NOW, band: 2 })
      .run();
    await publishSnapshot(db, 2, settings, NOW);

    const res = await app.request("/meta/2", { headers: { ...auth("tok"), "accept-encoding": "gzip" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const etag = res.headers.get("etag")!;
    const snap = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()) as MetaSnapshot;
    expect(snap).toMatchObject({ band: 2, matches: 1, patch: "16.19" });

    const plain = await app.request("/meta/2", { headers: auth("tok") });
    expect(((await plain.json()) as MetaSnapshot).band).toBe(2);
    expect((await app.request("/meta/2", { headers: { ...auth("tok"), "if-none-match": etag } })).status).toBe(304);

    const health = (await (await app.request("/health")).json()) as { patch: string; newestMatchAt: number; collector: { snapshots: unknown[] } };
    expect(health.patch).toBe("16.19");
    expect(health.newestMatchAt).toBe(NOW - MIN);
    expect(health.collector.snapshots).toHaveLength(1);
  });

  it("flags the collector as stale when no new game arrived for staleAfter, without failing the health check", async () => {
    const db = openDb(":memory:");
    let now = NOW;
    const app = createApp({ db, version: "t", riot: null, meta: new MetaJob(db, fakeRiot(), settings, { now: () => now, log: () => {} }), collectorStaleAfterMs: 3_600_000, now: () => now });
    const health = async () => {
      const res = await app.request("/health");
      return { status: res.status, collector: ((await res.json()) as { collector: { stale: boolean; lastDataAt: number | null } }).collector };
    };
    expect(await health()).toMatchObject({ status: 200, collector: { stale: true, lastDataAt: null } }); // never collected
    db.insert(schema.matches)
      .values({ matchId: "m", queueId: 420, gameVersion: "16.19", endedAt: NOW, durationSec: 1800, summary: { matchId: "m" } as never, source: "collector", storedAt: NOW, band: 2 })
      .run();
    expect((await health()).collector).toMatchObject({ stale: false, lastDataAt: NOW });
    now = NOW + 2 * 3_600_000;
    expect(await health()).toMatchObject({ status: 200, collector: { stale: true } });
  });

  it("starts the collector only for the owner", async () => {
    const { app, job } = setup();
    expect((await app.request("/admin/collect", { method: "POST" })).status).toBe(404);
    expect((await app.request("/admin/collect", { method: "POST", headers: auth("tok") })).status).toBe(404);
    const res = await app.request("/admin/collect", { method: "POST", headers: auth(ADMIN) });
    // Nothing collected yet counts as stale: the run starts, and the cron sees a failure (503).
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "collector_stale", started: true, running: true });
    await job.run();
    expect(job.lastRun()?.finishedAt).toBe(NOW);
    // Fresh data now: a normal 202.
    const again = await app.request("/admin/collect", { method: "POST", headers: auth(ADMIN) });
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ started: true, running: true });
    await job.run();
  });

  it("serves the scoring config with an ETag", async () => {
    const { app } = setup();
    const res = await app.request("/config");
    expect(((await res.json()) as { engine: { topN: number } }).engine.topN).toBe(config.engine.topN);
    expect((await app.request("/config", { headers: { "if-none-match": res.headers.get("etag")! } })).status).toBe(304);
  });
});
