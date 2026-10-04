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
  /** Comfort computed for `role` (see computeComfort). */
  comfort: Map<ChampionId, ComfortStats>;
  attributes: Map<ChampionId, ChampionAttributes>;
  /** Riot's recommended positions per champion (LCU); empty when unavailable. */
  intendedPositions: Map<ChampionId, Position[]>;
  role: Position | null;
  weights: FactorWeights;
  config: EngineConfig;
}

export type RoleFit = "meta" | "offMeta" | null;

/**
 * Whether a champion fits the role:
 * - "meta": Riot recommends it there, or other players play it there often enough;
 * - "offMeta": not meta there, but the player has played it there;
 * - null: neither (not suggested).
 */
export function roleFit(
  id: ChampionId,
  comfort: ComfortStats,
  role: Position | null,
  intended: Map<ChampionId, Position[]>,
  attributes: Map<ChampionId, ChampionAttributes>,
  minRoleShare: number,
): RoleFit {
  if (!role) return "meta";
  if (intended.get(id)?.includes(role)) return "meta";
  const share = attributes.get(id)?.roleShares[role];
  if (share !== undefined && share >= minRoleShare) return "meta";
  return (comfort.gamesByPosition[role] ?? 0) > 0 ? "offMeta" : null;
}

/**
 * Ranks the player's own champion pool for this draft. Pure: no I/O.
 * Pool = champions the player has games or mastery on, that are pickable and available,
 * and that fit the role. Off-meta picks the player plays stay in, tagged and penalised.
 */
export function recommendPicks(input: RecommendInput): PickRecommendation[] {
  const { comfort, attributes, role, config } = input;
  const pickable = new Set(input.pickable);
  const profile = teamProfile(allyChampions(input.draft), attributes);


  const out: PickRecommendation[] = [];
  for (const [id, c] of comfort) {
    if (input.unavailable.has(id)) continue;
    if (pickable.size && !pickable.has(id)) continue;
    const fit = roleFit(id, c, role, input.intendedPositions, attributes, config.roles.minRoleShare);
    if (!fit) continue;
    const offMeta = fit === "offMeta";

    const team = scoreTeamNeeds(attributes.get(id), profile, config.teamNeeds);
    const factors: FactorScores = {
      comfort: c.score,
      teamNeeds: team.score,
      laneMatchup: null, // milestone 3 (live meta)
      counterValue: null, // milestone 3
      metaStrength: null, // milestone 3
    };
    const reasons: string[] = [];
    const plural = (n: number) => (n === 1 ? "" : "s");
    if (role && c.gamesInRole && c.winRateInRole !== null) {
      const extra = c.games > c.gamesInRole ? ` (${c.games} games in all roles)` : "";
      reasons.push(`${c.gamesInRole} recent ${role} game${plural(c.gamesInRole)}, ${Math.round(c.winRateInRole * 100)}% win rate${extra}`);
    } else if (c.games > 0 && c.winRate !== null) {
      reasons.push(`${c.games} recent game${plural(c.games)}${role ? " in other roles" : ""}, ${Math.round(c.winRate * 100)}% win rate`);
    }
    if (c.masteryLevel !== null) reasons.push(`Mastery ${c.masteryLevel}, ${Math.round(c.masteryPoints / 1000)}k points`);
    reasons.push(...team.reasons);
    if (offMeta) {
      const listed = input.intendedPositions.get(id);
      reasons.push(`Off-meta in ${role}${listed?.length ? ` (usually ${listed.join(" / ")})` : ""}`);
    }
    const score = combineFactors(factors, input.weights) * (offMeta ? 1 - config.roles.offMetaPenalty : 1);
    out.push({ championId: id, score, factors, reasons, offMeta });
  }

  return out.sort((a, b) => b.score - a.score || a.championId - b.championId).slice(0, config.topN);
}
