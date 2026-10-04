import type { ChampionId, DraftState, FactorName, FactorScores, PickRecommendation, Position } from "@ldc/shared";
import type { EngineConfig, FactorWeights } from "./config";
import { scoreTeamNeeds, teamProfile } from "./team-needs";
import type { ChampionAttributes, ComfortStats, PlayerGame } from "./types";

/** Most-played position in the player's history (ignoring unknown positions), or null. */
export function mainRole(games: PlayerGame[]): Position | null {
  const counts = new Map<Position, number>();
  for (const g of games) if (g.position) counts.set(g.position, (counts.get(g.position) ?? 0) + 1);
  let best: Position | null = null;
  let bestN = 0;
  for (const [pos, n] of counts) if (n > bestN) [best, bestN] = [pos, n];
  return best;
}

/** The local player's role in this draft: the assigned position, else their main role. */
export function draftRole(draft: DraftState, games: PlayerGame[]): Position | null {
  const me = draft.myTeam.find((s) => s.isLocalPlayer);
  return me?.position || mainRole(games);
}

/** Champions locked or hovered by allies (excluding the local player). */
export function allyChampions(draft: DraftState): ChampionId[] {
  return draft.myTeam
    .filter((s) => !s.isLocalPlayer)
    .map((s) => s.championId || s.pickIntentId)
    .filter((id) => id > 0);
}

/** Weighted mean over the factors that have data; weights re-normalised. */
export function combineFactors(factors: FactorScores, weights: FactorWeights): number {
  let sum = 0;
  let total = 0;
  for (const k of Object.keys(factors) as FactorName[]) {
    const v = factors[k];
    if (v === null || weights[k] <= 0) continue;
    sum += v * weights[k];
    total += weights[k];
  }
  return total > 0 ? sum / total : 0;
}

export interface RecommendInput {
  draft: DraftState;
  /** Champions the player may pick right now (LCU); when empty, the whole pool is used. */
  pickable: ChampionId[];
  /** Champions that are banned or taken. */
  unavailable: Set<ChampionId>;
  comfort: Map<ChampionId, ComfortStats>;
  attributes: Map<ChampionId, ChampionAttributes>;
  role: Position | null;
  weights: FactorWeights;
  config: EngineConfig;
}

/**
 * Ranks the player's own champion pool for this draft. Pure: no I/O.
 * Pool = champions the player has games or mastery on, that are pickable and available,
 * and that fit the role (played there by the player, or measured in that role often enough).
 */
export function recommendPicks(input: RecommendInput): PickRecommendation[] {
  const { comfort, attributes, role, config } = input;
  const pickable = new Set(input.pickable);
  const profile = teamProfile(allyChampions(input.draft), attributes);

  const fitsRole = (id: ChampionId, c: ComfortStats): boolean => {
    if (!role) return true;
    if ((c.gamesByPosition[role] ?? 0) > 0) return true;
    const share = attributes.get(id)?.roleShares[role];
    return share !== undefined && share >= config.roles.minRoleShare;
  };

  const out: PickRecommendation[] = [];
  for (const [id, c] of comfort) {
    if (input.unavailable.has(id)) continue;
    if (pickable.size && !pickable.has(id)) continue;
    if (!fitsRole(id, c)) continue;

    const team = scoreTeamNeeds(attributes.get(id), profile, config.teamNeeds);
    const factors: FactorScores = {
      comfort: c.score,
      teamNeeds: team.score,
      laneMatchup: null, // milestone 3 (live meta)
      counterValue: null, // milestone 3
      metaStrength: null, // milestone 3
    };
    const reasons: string[] = [];
    if (c.games > 0 && c.winRate !== null) {
      reasons.push(`${c.games} recent game${c.games === 1 ? "" : "s"}, ${Math.round(c.winRate * 100)}% win rate`);
    }
    if (c.masteryLevel !== null) reasons.push(`Mastery ${c.masteryLevel}, ${Math.round(c.masteryPoints / 1000)}k points`);
    reasons.push(...team.reasons);
    out.push({ championId: id, score: combineFactors(factors, input.weights), factors, reasons });
  }

  return out.sort((a, b) => b.score - a.score || a.championId - b.championId).slice(0, config.topN);
}
