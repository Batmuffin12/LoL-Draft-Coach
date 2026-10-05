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
  topN: z.number().int().positive(),
});
export type EngineConfig = z.infer<typeof EngineConfigSchema>;

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
