import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { completedItems, traitCutsFrom, type EngineConfig, type RankBandConfig } from "@ldc/engine";
import { BandAggregator, BuildAggregator, ExpectedWinFitter, type MetaConfig } from "@ldc/meta";
import { RiotKeyError } from "@ldc/riot-api";
import type { ExpectedWinTable, ItemInfo, MatchSummary, RankBandId } from "@ldc/shared";
import { collect, pruneCollected, type CollectorRiot, type CollectResult } from "./collector";
import type { Db } from "./db";
import { collectorRuns, metaSnapshots, users } from "./db/schema";

const INTERRUPTED = "interrupted: the server stopped during the run";

const DAY_MS = 86_400_000;

export interface MetaSettings {
  meta: MetaConfig;
  bands: RankBandConfig;
  /** Engine config: its playstyle metrics get band references, and its challenges are kept. */
  engine: EngineConfig;
}

/** Playstyle and growth-focus metric names from the engine config (without the lower-is-better "-"). */
export function playstyleMetrics(engine: EngineConfig): string[] {
  const all = [...Object.values(engine.playstyle.axes).flatMap((a) => a.metrics), ...(engine.growth.metrics ?? [])];
  return [...new Set(all.map((m) => m.replace(/^-/, "")))];
}

/** The `challenges` fields the engine reads. */
export function challengeFields(engine: EngineConfig): Set<string> {
  return new Set(playstyleMetrics(engine).filter((m) => m.startsWith("challenges.")).map((m) => m.slice("challenges.".length)));
}

/**
 * Bands someone in the group plays in (the spec: only those are collected); the default band when
 * nobody has one yet. With `activeSince`, only users seen since then count: a friend who stopped
 * using the app no longer splits the collection budget.
 */
export function activeBands(db: Db, cfg: RankBandConfig, activeSince?: number): RankBandId[] {
  const bands = db
    .selectDistinct({ band: users.band })
    .from(users)
    .where(and(isNotNull(users.band), activeSince !== undefined ? gte(sql`coalesce(${users.lastSeenAt}, ${users.createdAt})`, activeSince) : undefined))
    .all()
    .map((r) => r.band!)
    .filter((b) => cfg.bands.some((x) => x.id === b))
    .sort((a, b) => a - b);
  return bands.length ? bands : [cfg.defaultBand];
}

/** The band above each active band, collected for builds only (spec: builds from your band plus the one above). */
export function buildBandsFor(active: RankBandId[], cfg: RankBandConfig): RankBandId[] {
  const ids = cfg.bands.map((b) => b.id).sort((a, b) => a - b);
  const above = active.map((b) => ids[ids.indexOf(b) + 1]).filter((b): b is RankBandId => b !== undefined && !active.includes(b));
  return [...new Set(above)];
}

export interface PublishedSnapshot {
  band: RankBandId;
  matches: number;
  patch: string | null;
  sizeBytes: number;
  etag: string;
}

/**
 * Aggregates a band's stored matches (streamed newest first) and stores the gzipped snapshot.
 * A second pass over the band and the band above (`buildBands`) adds builds, with enemy
 * traits from the first pass's attributes. Without an item catalog (Data Dragon unreachable),
 * builds have runes, spells and skills but no items.
 */
type Rows = (bands: RankBandId[]) => AsyncIterable<{ summary: string; band: number }>;

/** Rows read per chunk; between chunks the event loop runs, so the API keeps answering during aggregation. */
const CHUNK_ROWS = 500;

/**
 * Pass 1: the band's stats, and the expected-win fit over the band and the band above (for
 * win added in pass 2). A function of its own so its accumulators can be freed before pass 2
 * (the server runs in a 256 MB heap).
 */
async function bandPass(rows: Rows, band: RankBandId, bands: RankBandId[], settings: MetaSettings, now: number) {
  const agg = new BandAggregator({ band, now, config: settings.meta.aggregation, metrics: playstyleMetrics(settings.engine) });
  const fitter = new ExpectedWinFitter(settings.meta.builds.stateBins);
  for await (const row of rows(bands)) {
    const m = JSON.parse(row.summary) as MatchSummary;
    if (row.band === band) agg.add(m);
    fitter.add(m);
  }
  const base = agg.finish();
  // Keep the snapshot as text and only what pass 2 needs as objects (memory).
  return {
    baseJson: JSON.stringify(base),
    attributes: base.attributes,
    champions: base.champions.map((c) => ({ championId: c.championId, games: c.games })),
    summary: { matches: base.matches, patch: base.patch, newestMatchAt: base.newestMatchAt },
    expected: fitter.table(),
  };
}

/** Pass 2: builds from the band and the band above, with enemy traits from pass 1's attributes. */
async function buildPass(
  rows: Rows,
  bands: RankBandId[],
  settings: MetaSettings,
  now: number,
  base: Pick<Awaited<ReturnType<typeof bandPass>>, "attributes" | "champions">,
  expected: ExpectedWinTable,
  items: ReadonlyMap<number, ItemInfo> | null,
) {
  const { aggregation, builds } = settings.meta;
  const attributes = new Map(base.attributes.map((a) => [a.championId, a]));
  const traitCuts = traitCutsFrom(base.champions, attributes);
  const agg = new BuildAggregator({
    now,
    halfLifeDays: aggregation.halfLifeDays,
    windowDays: aggregation.windowDays,
    minDurationSec: aggregation.minDurationSec,
    config: builds,
    completed: items ? completedItems(items, settings.engine.loadout.items) : new Set(),
    attributes,
    traitCuts,
    expected,
  });
  for await (const row of rows(bands)) agg.add(JSON.parse(row.summary) as MatchSummary);
  return { builds: agg.finish(), itemRoles: agg.itemRoles(), roleRewards: agg.roleRewards(), traitCuts, expectedWin: agg.expectedWinTable() };
}

/**
 * Aggregates a band's stored matches (streamed newest first) and stores the gzipped snapshot.
 * A second pass over the band and the band above (`buildBands`) adds builds, with enemy
 * traits from the first pass's attributes. Without an item catalog (Data Dragon unreachable),
 * builds have runes, spells and skills but no items.
 */
export async function publishSnapshot(
  db: Db,
  band: RankBandId,
  settings: MetaSettings,
  now: number,
  extra: { buildBands?: RankBandId[]; items?: ReadonlyMap<number, ItemInfo> | null } = {},
): Promise<PublishedSnapshot> {
  const since = now - settings.meta.aggregation.windowDays * DAY_MS;
  // Newest first, in chunks (keyset on ended_at, match_id), yielding to the event loop between them.
  const rows: Rows = async function* (bands) {
    const stmt = db.$client.prepare(
      `SELECT summary, band, ended_at AS endedAt, match_id AS id FROM matches
       WHERE band IN (${bands.map(() => "?").join(",")}) AND ended_at > ? AND (ended_at < ? OR (ended_at = ? AND match_id < ?))
       ORDER BY ended_at DESC, match_id DESC LIMIT ?`,
    );
    let at = Number.MAX_SAFE_INTEGER;
    let id = "";
    for (;;) {
      const chunk = stmt.all(...bands, since, at, at, id, CHUNK_ROWS) as { summary: string; band: number; endedAt: number; id: string }[];
      yield* chunk;
      if (chunk.length < CHUNK_ROWS) return;
      ({ endedAt: at, id } = chunk[chunk.length - 1]!);
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  const bands = [band, ...(extra.buildBands ?? [])];
  const first = await bandPass(rows, band, bands, settings, now);
  const builds = JSON.stringify(await buildPass(rows, bands, settings, now, first, first.expected, extra.items ?? null));
  // The two parts are JSON objects with distinct keys: join them into one snapshot object.
  const json = `${first.baseJson.slice(0, -1)},${builds.slice(1)}`;
  const snapshot = first.summary;
  const body = gzipSync(json);
  const etag = `"${createHash("sha256").update(json).digest("hex").slice(0, 32)}"`;
  const row = {
    band,
    createdAt: now,
    etag,
    matches: snapshot.matches,
    patch: snapshot.patch,
    newestMatchAt: snapshot.newestMatchAt,
    sizeBytes: body.length,
    body,
  };
  db.insert(metaSnapshots).values(row).onConflictDoUpdate({ target: metaSnapshots.band, set: row }).run();
  return { band, matches: snapshot.matches, patch: snapshot.patch, sizeBytes: body.length, etag };
}

export interface MetaRunResult {
  startedAt: number;
  finishedAt: number;
  collected: CollectResult | null;
  /** Why collecting was skipped or stopped early (e.g. a rejected key); snapshots are still published. */
  error: string | null;
  pruned: number;
  snapshots: PublishedSnapshot[];
}

export interface MetaJobOptions {
  /** Data Dragon items for the current patch (to tell completed items); null when unavailable. */
  items?: () => Promise<ReadonlyMap<number, ItemInfo> | null>;
  now?: () => number;
  log?: (msg: string) => void;
  random?: () => number;
}

/**
 * One collector wake-up: gather new matches inside the time/match budget, prune old
 * ones, then aggregate and publish a snapshot per active band. Runs are started by
 * POST /admin/collect (an hourly cron), never by a timer in this process, so the
 * server can sleep in between. Only one run at a time.
 */
export class MetaJob {
  private current: Promise<MetaRunResult> | null = null;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;

  constructor(
    private readonly db: Db,
    private readonly riot: (CollectorRiot & { keyProblem?: unknown }) | null,
    private readonly settings: MetaSettings,
    private readonly opts: MetaJobOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(m));
  }

  get running(): boolean {
    return this.current !== null;
  }

  /** Starts a run, or returns the one in progress. */
  run(): Promise<MetaRunResult> {
    if (!this.current) this.current = this.execute().finally(() => (this.current = null));
    return this.current;
  }

  /**
   * Closes runs that never finished (the server stopped or was redeployed mid-run), so /health
   * doesn't show them as running forever. Called on shutdown and before each run.
   */
  closeOpenRuns(): void {
    this.db.update(collectorRuns).set({ finishedAt: this.now(), error: INTERRUPTED }).where(isNull(collectorRuns.finishedAt)).run();
  }

  /** The newest finished or running run, for /health. */
  lastRun() {
    return this.db.select().from(collectorRuns).orderBy(desc(collectorRuns.id)).limit(1).get() ?? null;
  }

  private async execute(): Promise<MetaRunResult> {
    const { meta, bands: bandConfig, engine } = this.settings;
    this.closeOpenRuns();
    const startedAt = this.now();
    const runId = this.db.insert(collectorRuns).values({ startedAt }).returning({ id: collectorRuns.id }).get().id;
    const bands = activeBands(this.db, bandConfig, startedAt - meta.collector.activeUserDays * DAY_MS);
    const buildBands = buildBandsFor(bands, bandConfig);
    let collected: CollectResult | null = null;
    let error: string | null = null;

    if (!this.riot) error = "No Riot API key configured.";
    else if (this.riot.keyProblem) error = "The Riot API key was rejected.";
    else {
      try {
        collected = await collect(this.db, this.riot, {
          bands,
          buildBands,
          bandConfig,
          collector: meta.collector,
          keepChallenges: challengeFields(engine),
          now: this.now,
          deadline: startedAt + meta.collector.budgetSeconds * 1000,
          since: startedAt - Math.min(meta.collector.lookbackDays, meta.aggregation.windowDays) * DAY_MS,
          minDurationSec: meta.aggregation.minDurationSec,
          earlyDeathsSec: engine.earlyDeathsMinute * 60,
          ...(this.opts.random ? { random: this.opts.random } : {}),
        });
      } catch (err) {
        error = err instanceof RiotKeyError ? "The Riot API key was rejected." : (err as Error).message;
      }
    }

    let pruned = 0;
    const snapshots: PublishedSnapshot[] = [];
    for (const band of [...bands, ...buildBands]) {
      pruned += pruneCollected(this.db, band, {
        windowDays: meta.aggregation.windowDays,
        maxStoredMatches: meta.collector.maxStoredMatches,
        now: this.now(),
      });
    }
    // Snapshots only for bands someone plays in; build-only bands feed the builds of the band below.
    const items = await (this.opts.items?.() ?? Promise.resolve(null)).catch((err: unknown) => {
      this.log(`meta: no item data, builds without items (${(err as Error).message})`);
      return null;
    });
    for (const band of bands) {
      const above = buildBandsFor([band], bandConfig);
      snapshots.push(await publishSnapshot(this.db, band, this.settings, this.now(), { buildBands: above, items }));
    }

    const finishedAt = this.now();
    this.db
      .update(collectorRuns)
      .set({ finishedAt, newMatches: collected?.newMatches ?? 0, riotCalls: collected?.riotCalls ?? 0, error })
      .where(eq(collectorRuns.id, runId))
      .run();
    this.log(
      `meta: +${collected?.newMatches ?? 0} matches (${collected?.timelines ?? 0} with timelines), ${collected?.riotCalls ?? 0} Riot calls, pruned ${pruned}, ` +
        snapshots.map((s) => `band ${s.band}: ${s.matches} matches ${Math.round(s.sizeBytes / 1024)} KB`).join("; ") +
        (error ? ` (${error})` : ""),
    );
    return { startedAt, finishedAt, collected, error, pruned, snapshots };
  }
}
