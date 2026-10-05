import { z } from "zod";
import type { FactorName, RankBandId } from "@ldc/shared";

const weight = z.number().min(0);
export const FactorWeightsSchema = z.object({
  comfort: weight,
  teamNeeds: weight,
  laneMatchup: weight,
  counterValue: weight,
  metaStrength: weight,
}) satisfies z.ZodType<Record<FactorName, number>>;
export type FactorWeights = z.infer<typeof FactorWeightsSchema>;

const unit = z.number().min(0).max(1);

export const EngineConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  bands: z.record(z.string().regex(/^\d+$/), FactorWeightsSchema),
  comfort: z.object({
    smoothingK: z.number().min(0),
    experienceScaleGames: z.number().positive(),
    winRateSpread: z.number().positive(),
    /** Champion skill: transfers across roles and fades slowly. */
    skill: z.object({
      halfLifeDays: z.number().positive(),
      /** Mastery counts half as much after this many days without playing the champion. */
      masteryStaleHalfLifeDays: z.number().positive(),
      /** Mastery milestone grades, worst to best. */
      gradeScale: z.array(z.string()).min(2),
      mix: z.object({ mastery: weight, grades: weight, winRate: weight }),
    }),
    /** Current form: recent games in the role. */
    form: z.object({
      halfLifeDays: z.number().positive(),
      /** Weight of games played on the champion in other roles (0..1). */
      offRoleGameWeight: unit,
      mix: z.object({ winRate: weight, experience: weight }),
    }),
    mix: z.object({ skill: weight, form: weight }),
  }),
  roleAdvice: z.object({
    halfLifeDays: z.number().positive(),
    experienceScaleGames: z.number().positive(),
    /** Below this many games in a role, it's shown as "not enough games". */
    minGames: z.number().int().min(1),
    topChampions: z.number().int().positive(),
    mix: z.object({ winRate: weight, experience: weight }),
  }),
  teamNeeds: z.object({
    minAttributeSamples: z.number().int().min(1),
    targetMagicShare: unit,
    frontlineThreshold: unit,
    engageThreshold: unit,
    reasonMinNeed: unit,
    reasonMinFit: unit,
    dimensions: z.object({ damageBalance: weight, frontline: weight, engage: weight }),
  }),
  roles: z.object({
    /** A role counts as meta for a champion when at least this share of other players' games are in it... */
    minRoleShare: unit,
    /** ...and the champion has been seen in at least this many of their games (small samples are noise). */
    minRoleSamples: z.number().int().min(1),
    /** Score reduction for picks you play in a role that isn't meta for the champion (0..1). */
    offMetaPenalty: unit,
    /** Games you need in a role before an off-meta champion is suggested there. */
    offMetaMinGames: z.number().int().min(1),
  }),
  /** Playstyle axes: percentiles of Riot metrics against others in the same role. */
  playstyle: z.object({
    halfLifeDays: z.number().positive(),
    /** Games in a role (and per axis) before a playstyle is shown. */
    minGamesPerRole: z.number().int().min(1),
    /** Metrics a single game needs for an axis to count it. */
    minMetrics: z.number().int().min(1),
    /** Reference values a metric needs before it is used. */
    minReferenceSamples: z.number().int().min(1),
    axes: z.record(z.string(), z.object({ metrics: z.array(z.string().regex(/^-?[\w.]+$/)).min(1) })),
  }),
  /** Champion pool tiers per role, and the draft needs the pool should cover. */
  pool: z.object({
    /** Main: at least coreGames in the role and comfort >= coreMin. */
    coreMin: unit,
    coreGames: z.number().int().min(1),
    /** Comfortable: comfort >= secondaryMin. */
    secondaryMin: unit,
    /** Learning: first played within learningWindowDays and at most learningMaxGames games. */
    learningWindowDays: z.number().positive(),
    learningMaxGames: z.number().int().min(1),
    /** Rusty: at least dormantMastery points, unplayed for dormantDays, and a listed role fit. */
    dormantMastery: z.number().min(0),
    dormantDays: z.number().positive(),
    maxPerTier: z.number().int().min(1),
    /** A champion covers a need at these measured levels (shares and percentiles, 0..1). */
    coverage: z.object({ damageShare: unit, frontline: unit, engage: unit }),
    /** A hole is shown only when the team lacked it in at least this share of the player's losses in the role... */
    minLossShare: unit,
    /** ...unless there are fewer losses than this to judge by (then it's shown without evidence). */
    minLossesForEvidence: z.number().int().min(1),
  }),
  /**
   * Engine v2 (live meta): every factor is a term in rating points (400·log10 odds), each a
   * change over what was already expected, smoothed toward that expectation. Used when a
   * meta snapshot is loaded; the factor weights in `bands` are the fallback without one.
   */
  rating: z.object({
    /** Term weights per rank band. */
    bands: z.record(z.string().regex(/^\d+$/), z.object({ meta: weight, lane: weight, counter: weight, synergy: weight, team: weight, personal: weight })),
    /** Prior games: how strongly thin statistics are pulled toward what was expected. */
    priorGames: z.object({ meta: z.number().min(0), pair: z.number().min(0) }),
    /** Statistics with fewer games are not shown as reasons ("not enough data"). */
    minGames: z.object({ meta: z.number().int().min(0), pair: z.number().int().min(0) }),
    /** Cross-lane opponents and allies matter less than the lane opponent (0..1). */
    counterWeight: unit,
    synergyWeight: unit,
    /** Rating points off a pick the player plays in a role that isn't meta for the champion. */
    offMetaPenalty: z.number().min(0),
    /** Team needs (0..1, 0.5 = neutral) to rating points: (score - 0.5) · ratingScale. */
    teamRatingScale: z.number().min(0),
    personal: z.object({
      /** Comfort (0..1) to rating points: (comfort - neutralComfort) · comfortScale. */
      comfortScale: z.number().min(0),
      neutralComfort: unit,
      /**
       * Comfort stops adding above this level: every champion the player is comfortable on
       * gets the same bonus, so the draft (meta, matchups, team) decides between them
       * instead of always the single most-played one.
       */
      fullComfort: unit,
      /** Rating points for a champion the player has never played; also the floor for low comfort. */
      learningPenalty: z.number().min(0),
      /** Suggest champions the player hasn't played yet (they carry the learning penalty). */
      includeUnplayed: z.boolean(),
    }),
    /** Lane opponent unknown: expected matchup over likely opponents, minus a share of the bad tail. */
    blind: z.object({
      riskAversion: z.number().min(0),
      /** Quantile (0..1) of the opponents' matchup deltas taken as the bad tail. */
      riskQuantile: unit,
      /** Most-played opponents considered. */
      maxOpponents: z.number().int().min(1),
      /** A blind pick is "safe" when its bad tail is no worse than this (rating points). */
      safeMaxLoss: z.number().min(0),
    }),
    /** The counter term counts this much more when every enemy has picked. */
    lastPickCounterBoost: z.number().min(1),
    bans: z.object({
      /** Champions picked in fewer games than this share (0..1) aren't considered. */
      minPickRate: unit,
      /** Weight of a champion's own strength next to how badly it beats your picks. */
      metaWeight: z.number().min(0),
      /** How many of your best picks a ban should protect. */
      protectPicks: z.number().int().min(1),
      topN: z.number().int().min(1),
    }),
    explain: z.object({
      /** Terms smaller than this change in win chance (0..1) give no reason. */
      minDeltaWin: unit,
      maxReasons: z.number().int().min(1),
      /** Predicted win-chance gap (0..1) between #1 and #2 for a "clear pick". */
      clearGapWin: unit,
      /** Factor bars: this change in win chance fills a bar from the middle to the end. */
      barScaleWin: z.number().positive(),
    }),
  }),
  topN: z.number().int().positive(),
});
export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type RatingConfig = EngineConfig["rating"];

export const RankBandConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  bands: z.array(z.object({ id: z.number().int(), name: z.string(), tiers: z.array(z.string()) })).min(1),
  defaultBand: z.number().int(),
  rankedQueueTypesByPriority: z.array(z.string()),
});
export type RankBandConfig = z.infer<typeof RankBandConfigSchema>;

export class ConfigError extends Error {}

function parse<T extends z.ZodType>(schema: T, name: string, json: unknown): z.infer<T> {
  const r = schema.safeParse(json);
  if (!r.success) throw new ConfigError(`Invalid ${name}:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export function parseEngineConfig(json: unknown): EngineConfig {
  return parse(EngineConfigSchema, "engine config", json);
}

export function parseRankBandConfig(json: unknown): RankBandConfig {
  const cfg = parse(RankBandConfigSchema, "rank band config", json);
  if (!cfg.bands.some((b) => b.id === cfg.defaultBand)) throw new ConfigError(`defaultBand ${cfg.defaultBand} is not a defined band`);
  return cfg;
}

/** Band for a tier string (case-insensitive); null when the tier isn't mapped. */
export function bandForTier(tier: string | null | undefined, cfg: RankBandConfig): RankBandId | null {
  if (!tier) return null;
  const t = tier.toUpperCase();
  return cfg.bands.find((b) => b.tiers.some((x) => x.toUpperCase() === t))?.id ?? null;
}

/**
 * Picks the band from a list of (queueType, tier) entries — e.g. LCU ranked stats or
 * League-V4 entries — preferring queues in the configured order. Falls back to defaultBand.
 */
export function bandFromRankedEntries(entries: { queueType: string; tier: string }[], cfg: RankBandConfig): RankBandId {
  for (const queueType of cfg.rankedQueueTypesByPriority) {
    const band = bandForTier(entries.find((e) => e.queueType === queueType)?.tier, cfg);
    if (band !== null) return band;
  }
  return cfg.defaultBand;
}

export function weightsForBand(band: RankBandId, cfg: EngineConfig): FactorWeights {
  const w = cfg.bands[String(band)];
  if (!w) throw new ConfigError(`No factor weights configured for band ${band}`);
  return w;
}

export const AppConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  history: z.object({
    matchCount: z.number().int().positive().max(1000),
    queues: z.array(z.number().int()).min(1),
  }),
  supportedQueues: z.array(z.number().int()),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function parseAppConfig(json: unknown): AppConfig {
  return parse(AppConfigSchema, "app config", json);
}
