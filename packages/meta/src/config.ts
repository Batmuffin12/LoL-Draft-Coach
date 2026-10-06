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
  /** Builds per champion-role (band plus the band above), from end-of-game data and timelines. */
  builds: z.object({
    /** Champion-roles need this many games for a build. */
    minGames: z.number().int().min(1),
    /** Items bought up to this second count as the starting items. */
    startingSeconds: z.number().min(0),
    /** Skill points a game needs before its skill order counts. */
    minSkillPoints: z.number().int().min(1),
    /** Completed items in a core path. */
    coreItems: z.number().int().min(2),
    /** Completed-item slots tracked for win added. */
    maxSlots: z.number().int().min(1),
    /** Options kept per list (pages, spells, …), most taken first, each with at least minOptionGames. */
    maxOptions: z.number().int().min(1),
    minOptionGames: z.number().int().min(1),
    /** Item slots need this many purchases to be published. */
    minItemGames: z.number().int().min(1),
    /** Win added is shrunk toward 0 with this many games. */
    winAddedPriorGames: z.number().min(0),
    /** Expected win per state bin: bucket edges (minutes, team gold difference) and smoothing toward 50%. */
    stateBins: z.object({ minutes: z.array(z.number()).min(1), goldDiff: z.array(z.number()).min(1), priorGames: z.number().min(0) }),
    /** Situational lift: smoothing, and what is published (games on each side, minimum lift, most per champion-role). */
    lift: z.object({ priorGames: z.number().min(0), minGames: z.number().int().min(1), minLift: z.number().min(1), maxPerBuild: z.number().int().min(0) }),
    /** Rune pages and items into a lane opponent are kept when the matchup has this many games. */
    minMatchupGames: z.number().int().min(1),
    /** Items published per build slot (the most bought). */
    maxItemsPerSlot: z.number().int().min(1),
    /** Lane opponents per champion-role with their own page or items in the snapshot (the most common ones). */
    maxMatchups: z.number().int().min(0),
    /** Distinct options (pages, starts, paths…) counted per champion-role; rarer ones are dropped (bounded memory). */
    counterCapacity: z.number().int().min(4),
    /** Items need this many games before their role shares are published. */
    minItemRoleGames: z.number().int().min(1),
    /** Role quest rewards: held at the end of at least rewardMinShare of a role's games, bought in at most rewardMaxBought of those (timeline games). */
    rewardMinShare: z.number().min(0).max(1),
    rewardMaxBought: z.number().min(0).max(1),
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
