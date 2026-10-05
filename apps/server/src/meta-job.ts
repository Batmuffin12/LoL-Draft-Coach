import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { desc, eq, isNotNull } from "drizzle-orm";
import type { EngineConfig, RankBandConfig } from "@ldc/engine";
import { BandAggregator, type MetaConfig } from "@ldc/meta";
import { RiotKeyError } from "@ldc/riot-api";
import type { MatchSummary, RankBandId } from "@ldc/shared";
import { collect, pruneCollected, type CollectorRiot, type CollectResult } from "./collector";
import type { Db } from "./db";
import { collectorRuns, metaSnapshots, users } from "./db/schema";

const DAY_MS = 86_400_000;

export interface MetaSettings {
  meta: MetaConfig;
  bands: RankBandConfig;
  /** Engine config: its playstyle metrics get band references, and its challenges are kept. */
  engine: EngineConfig;
}

/** Playstyle metric names from the engine config (without the lower-is-better "-"). */
export function playstyleMetrics(engine: EngineConfig): string[] {
  return [...new Set(Object.values(engine.playstyle.axes).flatMap((a) => a.metrics.map((m) => m.replace(/^-/, ""))))];
}

/** The `challenges` fields the engine reads. */
export function challengeFields(engine: EngineConfig): Set<string> {
  return new Set(playstyleMetrics(engine).filter((m) => m.startsWith("challenges.")).map((m) => m.slice("challenges.".length)));
}

/** Bands someone in the group plays in (the spec: only those are collected); the default band when nobody has one yet. */
export function activeBands(db: Db, cfg: RankBandConfig): RankBandId[] {
  const bands = db
    .selectDistinct({ band: users.band })
    .from(users)
    .where(isNotNull(users.band))
    .all()
    .map((r) => r.band!)
    .filter((b) => cfg.bands.some((x) => x.id === b))
    .sort((a, b) => a - b);
  return bands.length ? bands : [cfg.defaultBand];
}

export interface PublishedSnapshot {
  band: RankBandId;
  matches: number;
  patch: string | null;
  sizeBytes: number;
  etag: string;
}

/** Aggregates a band's stored matches (streamed newest first) and stores the gzipped snapshot. */
export function publishSnapshot(db: Db, band: RankBandId, settings: MetaSettings, now: number): PublishedSnapshot {
  const agg = new BandAggregator({ band, now, config: settings.meta.aggregation, metrics: playstyleMetrics(settings.engine) });
  const rows = db.$client
    .prepare("SELECT summary FROM matches WHERE band = ? AND ended_at > ? ORDER BY ended_at DESC")
    .iterate(band, now - settings.meta.aggregation.windowDays * DAY_MS) as Iterable<{ summary: string }>;
  for (const row of rows) agg.add(JSON.parse(row.summary) as MatchSummary);
  const snapshot = agg.finish();
  const json = JSON.stringify(snapshot);
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

  /** The newest finished or running run, for /health. */
  lastRun() {
    return this.db.select().from(collectorRuns).orderBy(desc(collectorRuns.id)).limit(1).get() ?? null;
  }

  private async execute(): Promise<MetaRunResult> {
    const { meta, bands: bandConfig, engine } = this.settings;
    const startedAt = this.now();
    const runId = this.db.insert(collectorRuns).values({ startedAt }).returning({ id: collectorRuns.id }).get().id;
    const bands = activeBands(this.db, bandConfig);
    let collected: CollectResult | null = null;
    let error: string | null = null;

    if (!this.riot) error = "No Riot API key configured.";
    else if (this.riot.keyProblem) error = "The Riot API key was rejected.";
    else {
      try {
        collected = await collect(this.db, this.riot, {
          bands,
          bandConfig,
          collector: meta.collector,
          keepChallenges: challengeFields(engine),
          now: this.now,
          deadline: startedAt + meta.collector.budgetSeconds * 1000,
          since: startedAt - meta.aggregation.windowDays * DAY_MS,
          ...(this.opts.random ? { random: this.opts.random } : {}),
        });
      } catch (err) {
        error = err instanceof RiotKeyError ? "The Riot API key was rejected." : (err as Error).message;
      }
    }

    let pruned = 0;
    const snapshots: PublishedSnapshot[] = [];
    for (const band of bands) {
      pruned += pruneCollected(this.db, band, {
        windowDays: meta.aggregation.windowDays,
        maxStoredMatches: meta.collector.maxStoredMatches,
        now: this.now(),
      });
      snapshots.push(publishSnapshot(this.db, band, this.settings, this.now()));
    }

    const finishedAt = this.now();
    this.db
      .update(collectorRuns)
      .set({ finishedAt, newMatches: collected?.newMatches ?? 0, riotCalls: collected?.riotCalls ?? 0, error })
      .where(eq(collectorRuns.id, runId))
      .run();
    this.log(
      `meta: +${collected?.newMatches ?? 0} matches, ${collected?.riotCalls ?? 0} Riot calls, pruned ${pruned}, ` +
        snapshots.map((s) => `band ${s.band}: ${s.matches} matches ${Math.round(s.sizeBytes / 1024)} KB`).join("; ") +
        (error ? ` (${error})` : ""),
    );
    return { startedAt, finishedAt, collected, error, pruned, snapshots };
  }
}
