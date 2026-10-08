import { describe, expect, it } from "vitest";
import { adviseLivePicks, MetaIndex } from "@ldc/engine";
import { MatchSchema, summarizeMatch } from "@ldc/riot-api";
import { findConfigDir as serverConfigDir, loadServerConfig, measureSpikes, openDb, publishSnapshot } from "@ldc/server";
import type { DraftState, MetaSnapshot } from "@ldc/shared";
import { MetaSnapshotSchema } from "../src/main/server-client";

const NOW = 1_800_000_000_000;
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** A finished ranked game: champions 100+i (blue) and 200+i (red); blue wins every other game. */
function match(k: number) {
  return summarizeMatch(
    MatchSchema.parse({
      metadata: { matchId: `EUW1_${k}` },
      info: {
        gameCreation: NOW - k * 3_600_000 - 1_800_000,
        gameDuration: 1800,
        gameEndTimestamp: NOW - k * 3_600_000,
        gameVersion: "16.19.1",
        queueId: 420,
        participants: Array.from({ length: 10 }, (_, i) => ({
          puuid: `P-${k}-${i}`,
          championId: (i < 5 ? 100 : 200) + (i % 5) + (k % 2) * 10,
          teamId: i < 5 ? 100 : 200,
          teamPosition: ROLES[i % 5],
          win: (i < 5) === (k % 2 === 0),
          totalDamageDealtToChampions: 10_000,
          physicalDamageDealtToChampions: 6000,
          magicDamageDealtToChampions: 4000,
          challenges: { killParticipation: 0.5 },
        })),
      },
    }),
  );
}

/**
 * The contract between server and desktop: a snapshot built by the real aggregation (the
 * server's publishSnapshot over stored games) must pass the desktop's snapshot check, and the
 * engine must score a draft from it with finite numbers. A change on either side that breaks
 * the other fails here, not as NaN in the panel.
 */
describe("meta snapshot contract", () => {
  it("a server-built snapshot passes the desktop's check and scores a draft", async () => {
    const config = loadServerConfig(serverConfigDir(__dirname));
    const db = openDb(":memory:");
    const insert = db.$client.prepare(
      "INSERT INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, source, stored_at, band) VALUES (?, 420, '16.19.1', ?, 1800, ?, 'collector', ?, 2)",
    );
    for (let k = 0; k < 120; k++) {
      const m = match(k);
      insert.run(m.matchId, m.endedAt, JSON.stringify(m), NOW);
    }
    const settings = { meta: config.meta, bands: config.bands, engine: config.engine };
    await publishSnapshot(db, 2, settings, NOW, { spikes: await measureSpikes(db, [2], settings, NOW, null) });
    const { gunzipSync } = await import("node:zlib");
    const row = db.$client.prepare("SELECT body FROM meta_snapshots WHERE band = 2").get() as { body: Buffer };
    const json = JSON.parse(gunzipSync(row.body).toString()) as unknown;

    const parsed = MetaSnapshotSchema.safeParse(json);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);

    const snapshot = json as MetaSnapshot;
    // No timelines in these games: the spikes are empty, and their check says so.
    expect(snapshot.spikes).toEqual([]);
    expect(snapshot.spikeCheck).toMatchObject({ pairs: 0, goldCorrelation: null });
    const slot = (cellId: number, championId = 0, position = "", local = false) => ({ cellId, championId, pickIntentId: 0, position, isLocalPlayer: local });
    const draft: DraftState = {
      timerPhase: "BAN_PICK",
      timeLeftMs: 30_000,
      isCustomGame: false,
      localCellId: 2,
      myTeam: [slot(0, 100, "top"), slot(1, 101, "jungle"), slot(2, 0, "middle", true), slot(3, 0, "bottom"), slot(4, 0, "utility")],
      theirTeam: [slot(5, 202), slot(6, 200)],
      myBans: [],
      theirBans: [],
      actions: [],
    };
    const advice = adviseLivePicks({
      draft,
      pickable: [102, 112],
      unavailable: new Set([100, 101, 200, 202]),
      comfort: new Map(),
      attributes: new Map(),
      intendedPositions: new Map(),
      role: "middle",
      weights: config.engine.bands["2"]!,
      config: config.engine,
      index: new MetaIndex(snapshot, config.engine.rating),
      band: 2,
    });
    expect(advice.picks.length).toBeGreaterThan(0);
    for (const p of advice.picks) expect(Number.isFinite(p.expectedWin)).toBe(true);
  });
});
