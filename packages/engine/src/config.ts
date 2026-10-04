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
    recencyHalfLifeDays: z.number().positive(),
    smoothingK: z.number().min(0),
    experienceScaleGames: z.number().positive(),
    winRateSpread: z.number().positive(),
    mix: z.object({ winRate: weight, experience: weight, mastery: weight }),
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
  roles: z.object({ minRoleShare: unit }),
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
