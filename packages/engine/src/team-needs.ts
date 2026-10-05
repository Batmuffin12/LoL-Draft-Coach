import type { ChampionId, Reason } from "@ldc/shared";
import { reason } from "./explain";
import type { EngineConfig } from "./config";
import type { ChampionAttributes } from "./types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface TeamProfile {
  /** Allies with measured attributes. */
  known: number;
  magicShare: number;
  maxFrontline: number;
  maxEngage: number;
}

export interface TeamNeeds {
  magic: number;
  physical: number;
  frontline: number;
  engage: number;
}

/** Summarises the allies already picked (or hovered) using measured attributes. */
export function teamProfile(allies: ChampionId[], attrs: Map<ChampionId, ChampionAttributes>): TeamProfile {
  const known = allies.map((id) => attrs.get(id)).filter((a): a is ChampionAttributes => !!a);
  if (!known.length) return { known: 0, magicShare: 0, maxFrontline: 0, maxEngage: 0 };
  return {
    known: known.length,
    magicShare: known.reduce((s, a) => s + a.magicShare, 0) / known.length,
    maxFrontline: Math.max(...known.map((a) => a.frontline)),
    maxEngage: Math.max(...known.map((a) => a.engage)),
  };
}

/** How much the team lacks each dimension, in [0, 1]. Targets come from config. */
export function teamNeeds(profile: TeamProfile, cfg: EngineConfig["teamNeeds"]): TeamNeeds {
  const t = cfg.targetMagicShare;
  return {
    magic: t > 0 ? clamp01((t - profile.magicShare) / t) : 0,
    physical: t < 1 ? clamp01((profile.magicShare - t) / (1 - t)) : 0,
    frontline: clamp01((cfg.frontlineThreshold - profile.maxFrontline) / cfg.frontlineThreshold),
    engage: clamp01((cfg.engageThreshold - profile.maxEngage) / cfg.engageThreshold),
  };
}

export interface TeamNeedsScore {
  /** In [0, 1]; null when there is nothing to judge yet (no known allies). */
  score: number | null;
  reasons: Reason[];
}

/**
 * Team-needs factor for one candidate: how well it fills what the team lacks,
 * weighted by how much the team lacks it. 0.5 = neutral.
 */
export function scoreTeamNeeds(
  candidate: ChampionAttributes | undefined,
  profile: TeamProfile,
  cfg: EngineConfig["teamNeeds"],
): TeamNeedsScore {
  if (profile.known === 0) return { score: null, reasons: [] };
  if (!candidate) return { score: 0.5, reasons: [] };

  const needs = teamNeeds(profile, cfg);
  const w = cfg.dimensions;
  const damageNeed = Math.max(needs.magic, needs.physical);
  const damageFit = needs.magic >= needs.physical ? candidate.magicShare : candidate.physicalShare;
  const parts = [
    { need: damageNeed * w.damageBalance, fit: damageFit },
    { need: needs.frontline * w.frontline, fit: candidate.frontline },
    { need: needs.engage * w.engage, fit: candidate.engage },
  ];
  const totalNeed = parts.reduce((s, p) => s + p.need, 0);
  if (totalNeed === 0) return { score: 0.5, reasons: [] };
  const score = parts.reduce((s, p) => s + p.need * p.fit, 0) / totalNeed;

  const reasons: Reason[] = [];
  const { reasonMinNeed: minNeed, reasonMinFit: strong } = cfg;
  if (damageNeed > minNeed && damageFit >= strong) {
    reasons.push(
      needs.magic >= needs.physical
        ? reason("team.magic", { physical: 1 - profile.magicShare })
        : reason("team.physical", { magic: profile.magicShare }),
    );
  }
  if (needs.frontline > minNeed && candidate.frontline >= strong) reasons.push(reason("team.frontline"));
  if (needs.engage > minNeed && candidate.engage >= strong) reasons.push(reason("team.engage"));
  return { score: clamp01(score), reasons };
}
