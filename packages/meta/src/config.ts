import { z } from "zod";

export const MetaConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  aggregation: z.object({
    /** A game's weight halves every halfLifeDays (rolling window, not patch buckets). */
    halfLifeDays: z.number().positive(),
    /** Games older than this are ignored (and pruned by the server). */
    windowDays: z.number().positive(),
    /** Shorter games are remakes and are skipped. */
    minDurationSec: z.number().min(0),
    /** Pairs (matchups, duos) seen fewer times than this are left out of the snapshot. */
    minPairGames: z.number().int().min(1),
    /** Champions need this many games for measured attributes. */
    minAttributeSamples: z.number().int().min(1),
    /** Number of evenly spaced quantiles stored per playstyle reference (min … max). */
    referenceQuantiles: z.number().int().min(3).max(101),
    /** References use at most this many values per role and metric (the newest games). */
    referenceMaxSamples: z.number().int().min(1),
    /** Values a role/metric needs before a reference is published. */
    minReferenceSamples: z.number().int().min(1),
    /** Power curve: win rate in games shorter than earlyMinutes vs longer than lateMinutes. */
    powerCurve: z.object({ earlyMinutes: z.number().positive(), lateMinutes: z.number().positive() }),
    /** Trending champions: the last recentDays compared with the rest of the window. */
    trend: z.object({
      recentDays: z.number().positive(),
      /** Games a champion-role needs in each period before it can be called trending. */
      minGames: z.number().int().min(1),
      /** Pick rate trend: recent ≥ pickRateFactor × before, and recent ≥ minPickRate (0..1). */
      pickRateFactor: z.number().min(1),
      minPickRate: z.number().min(0).max(1),
      /** Win rate trend: a rise of at least minWinRateRise (0..1). Both trends must also be minZ standard errors clear of noise. */
      minWinRateRise: z.number().min(0).max(1),
      minZ: z.number().min(0),
    }),
  }),
  collector: z.object({
    /** League-V4 queue to sample players from, and the Match-V5 queue id of its games. */
    leagueQueue: z.string().min(1),
    queueId: z.number().int(),
    /** League-V4 divisions to page through (tiers come from config/rank-bands). */
    divisions: z.array(z.string().min(1)).min(1),
    /** Newest ranked games looked at per sampled player. */
    matchesPerPlayer: z.number().int().min(1).max(100),
    /** Upper bounds for one wake-up: wall time, and new matches fetched. */
    budgetSeconds: z.number().positive(),
    maxMatchesPerRun: z.number().int().min(1),
    /** Share of new matches that also get their timeline (one more call each: fewer games per hour, but builds and item purchases). */
    timelineShare: z.number().min(0).max(1),
    /** Share of the match budget for the band above each active band (builds only). */
    buildBandShare: z.number().min(0).max(1),
    /** Collected matches kept per band (newest first); older ones are pruned to bound disk and memory. */
    maxStoredMatches: z.number().int().min(1),
    /** /health calls the collector stale after this many hours without a new game. */
    staleAfterHours: z.number().positive(),
  }),
});
export type MetaConfig = z.infer<typeof MetaConfigSchema>;
export type AggregationConfig = MetaConfig["aggregation"];

export class MetaConfigError extends Error {}

export function parseMetaConfig(json: unknown): MetaConfig {
  const r = MetaConfigSchema.safeParse(json);
  if (!r.success) throw new MetaConfigError(`Invalid meta config:\n${z.prettifyError(r.error)}`);
  return r.data;
}
