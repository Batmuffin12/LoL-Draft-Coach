import { and, eq, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import type { RankBandConfig } from "@ldc/engine";
import type { MetaConfig } from "@ldc/meta";
import { RiotKeyError, summarizeMatch, summarizeTimeline, type RiotApi } from "@ldc/riot-api";
import type { MatchSummary, RankBandId } from "@ldc/shared";
import type { Db } from "./db";
import { collectorCursors, matches, userMatches } from "./db/schema";

const DAY_MS = 86_400_000;
const MAX_FAILURES = 5;

/** What collecting needs from the Riot API adapter. */
export type CollectorRiot = Pick<RiotApi, "leaguePlayers" | "matchIdsByPuuid" | "match" | "timeline">;

export interface CollectOptions {
  bands: RankBandId[];
  /**
   * Bands collected for builds only (the band above each active one: the spec takes builds,
   * runes and skill orders from your band plus the one above). They get `buildBandShare` of the match budget.
   */
  buildBands?: RankBandId[];
  bandConfig: RankBandConfig;
  collector: MetaConfig["collector"];
  /** Match-V5 `challenges` fields to keep on collected matches (the ones the engine reads). */
  keepChallenges: ReadonlySet<string>;
  now: () => number;
  /** Stop starting new work after this time (epoch ms). */
  deadline: number;
  /** Only games that ended after this (epoch ms) are listed. */
  since: number;
  /** Games shorter than this are remakes the aggregation drops: they get no timeline. */
  minDurationSec?: number;
  /** For shuffling a page of players (tests pass a fixed one). */
  random?: () => number;
}

export interface CollectResult {
  newMatches: number;
  /** New matches that came with their timeline. */
  timelines: number;
  perBand: Record<number, number>;
  riotCalls: number;
}

/** Drops `challenges` fields the engine doesn't read, to keep collected matches small. */
export function trimChallenges(summary: MatchSummary, keep: ReadonlySet<string>): MatchSummary {
  return {
    ...summary,
    participants: summary.participants.map((p) => ({
      ...p,
      challenges: Object.fromEntries(Object.entries(p.challenges).filter(([k]) => keep.has(k))),
    })),
  };
}

export interface Cursor {
  tierIndex: number;
  divisionIndex: number;
  page: number;
}

function loadCursor(db: Db, band: RankBandId): Cursor {
  const c = db.select().from(collectorCursors).where(eq(collectorCursors.band, band)).get();
  return c ? { tierIndex: c.tierIndex, divisionIndex: c.divisionIndex, page: c.page } : { tierIndex: 0, divisionIndex: 0, page: 1 };
}

function saveCursor(db: Db, band: RankBandId, c: Cursor, now: number): void {
  db.insert(collectorCursors)
    .values({ band, ...c, updatedAt: now })
    .onConflictDoUpdate({ target: collectorCursors.band, set: { ...c, updatedAt: now } })
    .run();
}

/** Next division (then tier); after the last tier, the next page. */
export function nextCursor(c: Cursor, tiers: number, divisions: number): Cursor {
  const divisionIndex = (c.divisionIndex + 1) % divisions;
  const tierIndex = divisionIndex === 0 ? (c.tierIndex + 1) % tiers : c.tierIndex;
  const page = divisionIndex === 0 && tierIndex === 0 ? c.page + 1 : c.page;
  return { tierIndex, divisionIndex, page };
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Gathers recent ranked games for the meta, inside a time and match budget. For each
 * band it pages through League-V4 player lists (tiers from the band config, divisions
 * from the meta config), keeping only a cursor between runs. Player PUUIDs are used in
 * memory to list their newest games and are never stored; matches are stored
 * anonymised (summaries carry no identifiers) and tagged with the band.
 * Every call goes through the shared rate limiter at collector priority, so user
 * requests always go first.
 */
export async function collect(db: Db, riot: CollectorRiot, opts: CollectOptions): Promise<CollectResult> {
  const { collector: cfg, now } = opts;
  const random = opts.random ?? Math.random;
  const result: CollectResult = { newMatches: 0, timelines: 0, perBand: {}, riotCalls: 0 };
  if (!opts.bands.length) return result;
  const buildBands = (opts.buildBands ?? []).filter((b) => !opts.bands.includes(b));
  const buildBudget = buildBands.length ? Math.round(cfg.maxMatchesPerRun * cfg.buildBandShare) : 0;
  const budgets = new Map<RankBandId, number>([
    ...opts.bands.map((b): [RankBandId, number] => [b, Math.ceil((cfg.maxMatchesPerRun - buildBudget) / opts.bands.length)]),
    ...buildBands.map((b): [RankBandId, number] => [b, Math.ceil(buildBudget / buildBands.length)]),
  ]);
  // A few failed calls (Riot 5xx, a changed payload) skip that player; many in one run stop it.
  let failures = 0;
  const onFailure = (err: unknown) => {
    if (err instanceof RiotKeyError || ++failures >= MAX_FAILURES) throw err;
  };

  // Time is shared like the match budget: each band must stop by its slice's end (a band that
  // finishes early leaves its time to the next ones).
  const start = now();
  const total = [...budgets.values()].reduce((a, b) => a + b, 0);
  let usedBudget = 0;
  for (const [band, perBandMax] of budgets) {
    usedBudget += perBandMax;
    if (perBandMax <= 0) continue;
    const bandDeadline = Math.min(opts.deadline, start + ((opts.deadline - start) * usedBudget) / total);
    const tiers = opts.bandConfig.bands.find((b) => b.id === band)?.tiers ?? [];
    if (!tiers.length) continue;
    let added = 0;
    let emptyInARow = 0;
    const done = () => added >= perBandMax || now() >= bandDeadline;
    const timelineShare = buildBands.includes(band) ? cfg.buildBandTimelineShare : cfg.timelineShare;

    while (!done()) {
      const cursor = loadCursor(db, band);
      const tier = tiers[cursor.tierIndex % tiers.length]!;
      const division = cfg.divisions[cursor.divisionIndex % cfg.divisions.length]!;
      let players: Awaited<ReturnType<CollectorRiot["leaguePlayers"]>> = [];
      try {
        players = await riot.leaguePlayers({ queue: cfg.leagueQueue, tier, division, page: cursor.page }, "collector");
        result.riotCalls++;
      } catch (err) {
        onFailure(err);
      }
      // Rotate through every tier and division page by page, so each run samples the whole band.
      saveCursor(db, band, nextCursor(cursor, tiers.length, cfg.divisions.length), now());
      if (!players.length) {
        // A full cycle of empty lists: every list has ended (or failed), so start again at page 1.
        if (++emptyInARow >= tiers.length * cfg.divisions.length) {
          saveCursor(db, band, { tierIndex: 0, divisionIndex: 0, page: 1 }, now());
          break;
        }
        continue;
      }
      emptyInARow = 0;

      for (const player of shuffle(players.filter((p) => !p.inactive), random)) {
        if (done()) break;
        try {
          const n = await collectPlayer(db, riot, player.puuid, band, timelineShare, opts, result, done);
          added += n;
          result.newMatches += n;
        } catch (err) {
          onFailure(err);
        }
      }
    }
    result.perBand[band] = added;
  }
  return result;
}

/** Stores a player's newest ranked games that aren't stored yet; returns how many were added. */
async function collectPlayer(
  db: Db,
  riot: CollectorRiot,
  puuid: string,
  band: RankBandId,
  timelineShare: number,
  opts: CollectOptions,
  result: CollectResult,
  done: () => boolean,
): Promise<number> {
  const cfg = opts.collector;
  const ids = await riot.matchIdsByPuuid(puuid, { queue: cfg.queueId, type: "ranked", count: cfg.matchesPerPlayer, startTime: Math.floor(opts.since / 1000) }, "collector");
  result.riotCalls++;
  if (!ids.length) return 0;
  const known = new Map(
    db.select({ id: matches.matchId, band: matches.band }).from(matches).where(inArray(matches.matchId, ids)).all().map((r) => [r.id, r.band]),
  );
  // A match already stored for a user's history also counts for the meta.
  const untagged = [...known].filter(([, b]) => b === null).map(([id]) => id);
  if (untagged.length) db.update(matches).set({ band }).where(and(inArray(matches.matchId, untagged), isNull(matches.band))).run();

  let added = 0;
  for (const id of ids) {
    if (known.has(id) || done()) continue;
    const match = await riot.match(id, "collector");
    result.riotCalls++;
    if (!match || match.info.queueId !== cfg.queueId) continue;
    let summary = trimChallenges(summarizeMatch(match), opts.keepChallenges);
    // Timelines (builds, item purchases, skill order) cost one more call, so only a share of games get one
    // (never remakes: the aggregation drops them).
    const remake = summary.durationSec < (opts.minDurationSec ?? 0);
    if (!remake && (opts.random ?? Math.random)() < timelineShare && !done()) {
      const timeline = await riot.timeline(id, "collector").catch((err: unknown) => {
        if (err instanceof RiotKeyError) throw err;
        return null;
      });
      result.riotCalls++;
      if (timeline) summary = { ...summary, timeline: summarizeTimeline(timeline, match) };
    }
    const inserted = db
      .insert(matches)
      .values({
        matchId: summary.matchId,
        queueId: summary.queueId,
        gameVersion: summary.gameVersion,
        endedAt: summary.endedAt,
        durationSec: summary.durationSec,
        summary,
        source: "collector",
        storedAt: opts.now(),
        band,
      })
      .onConflictDoNothing()
      .run();
    added += inserted.changes;
    if (inserted.changes && summary.timeline) result.timelines++;
  }
  return added;
}

/**
 * Keeps each band's collected matches inside the window and under the stored-match cap
 * (newest kept). Matches that a user's history links to are never deleted here.
 */
export function pruneCollected(db: Db, band: RankBandId, opts: { windowDays: number; maxStoredMatches: number; now: number }): number {
  const notInHistory = notExists(db.select({ x: sql`1` }).from(userMatches).where(eq(userMatches.matchId, matches.matchId)));
  const isCollected = and(eq(matches.band, band), eq(matches.source, "collector"), notInHistory);
  let removed = db.delete(matches).where(and(isCollected, lt(matches.endedAt, opts.now - opts.windowDays * DAY_MS))).run().changes;
  const cutoff = db
    .select({ endedAt: matches.endedAt })
    .from(matches)
    .where(and(eq(matches.band, band), eq(matches.source, "collector")))
    .orderBy(sql`${matches.endedAt} DESC`)
    .limit(1)
    .offset(opts.maxStoredMatches - 1)
    .get();
  if (cutoff) removed += db.delete(matches).where(and(isCollected, lt(matches.endedAt, cutoff.endedAt))).run().changes;
  return removed;
}
