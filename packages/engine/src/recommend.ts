import type { ChampionId, DraftState, FactorName, FactorScores, PickAdvice, PickRecommendation, Position, Reason } from "@ldc/shared";
import type { EngineConfig, FactorWeights } from "./config";
import { confidenceOf, reason, type ExplainConfig } from "./explain";
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
 * - "offMeta": not meta there, but the player has played it there at least offMetaMinGames times;
 * - null: neither (not suggested).
 */
export function roleFit(
  id: ChampionId,
  comfort: ComfortStats,
  role: Position | null,
  intended: Map<ChampionId, Position[]>,
  attributes: Map<ChampionId, ChampionAttributes>,
  roles: EngineConfig["roles"],
): RoleFit {
  if (!role) return "meta";
  if (intended.get(id)?.includes(role)) return "meta";
  const measured = attributes.get(id);
  const share = measured?.roleShares[role];
  if (measured && measured.roleSamples >= roles.minRoleSamples && share !== undefined && share >= roles.minRoleShare) return "meta";
  return (comfort.gamesByPosition[role] ?? 0) >= roles.offMetaMinGames ? "offMeta" : null;
}

/** Scores every eligible champion in the player's pool (unsorted, not cut to topN). */
function scoreCandidates(input: RecommendInput): PickRecommendation[] {
  const { comfort, attributes, role, config } = input;
  const pickable = new Set(input.pickable);
  const profile = teamProfile(allyChampions(input.draft), attributes);

  const out: PickRecommendation[] = [];
  for (const [id, c] of comfort) {
    if (input.unavailable.has(id)) continue;
    if (pickable.size && !pickable.has(id)) continue;
    const fit = roleFit(id, c, role, input.intendedPositions, attributes, config.roles);
    if (!fit) continue;
    const offMeta = fit === "offMeta";

    const team = scoreTeamNeeds(attributes.get(id), profile, config.teamNeeds);
    const factors: FactorScores = {
      comfort: c.score,
      teamNeeds: team.score,
      laneMatchup: null, // milestone 5 (live meta)
      counterValue: null, // milestone 5
      metaStrength: null, // milestone 5
    };
    const reasons: Reason[] = [];
    if (role && c.gamesInRole && c.winRateInRole !== null) {
      reasons.push(
        c.games > c.gamesInRole
          ? reason("comfort.roleWithAll", { games: c.gamesInRole, role, winRate: c.winRateInRole, allGames: c.games })
          : reason("comfort.role", { games: c.gamesInRole, role, winRate: c.winRateInRole }),
      );
    } else if (c.games > 0 && c.winRate !== null) {
      reasons.push(reason(role ? "comfort.otherRoles" : "comfort.any", { games: c.games, winRate: c.winRate }));
    }
    if (c.masteryLevel !== null) {
      const kPoints = Math.round(c.masteryPoints / 1000);
      reasons.push(
        c.grades.length
          ? reason("mastery.grades", { level: c.masteryLevel, kPoints, grades: c.grades.join(" ") })
          : reason("mastery", { level: c.masteryLevel, kPoints }),
      );
    }
    reasons.push(...team.reasons);
    if (offMeta && role) {
      const listed = input.intendedPositions.get(id);
      reasons.push(listed?.length ? reason("offMeta.usual", { role, usual: listed.join(" / ") }) : reason("offMeta", { role }));
    }
    const score = combineFactors(factors, input.weights) * (offMeta ? 1 - config.roles.offMetaPenalty : 1);
    out.push({ championId: id, score, factors, reasons, offMeta });
  }
  return out;
}

const byScore = (a: PickRecommendation, b: PickRecommendation) => b.score - a.score || a.championId - b.championId;

/**
 * Ranks the player's own champion pool for this draft. Pure: no I/O.
 * Pool = champions the player has games or mastery on, that are pickable and available,
 * and that fit the role. Off-meta picks the player plays stay in, tagged and penalised.
 */
export function recommendPicks(input: RecommendInput): PickRecommendation[] {
  return scoreCandidates(input).sort(byScore).slice(0, input.config.topN);
}

/**
 * The player's usual pick for the role: their highest-comfort champion that they have
 * played and that fits the role (whether or not it is available right now).
 */
export function usualPick(input: RecommendInput): ComfortStats | null {
  let best: ComfortStats | null = null;
  for (const c of input.comfort.values()) {
    const played = input.role ? (c.gamesInRole ?? 0) : c.games;
    if (played <= 0) continue;
    if (!roleFit(c.championId, c, input.role, input.intendedPositions, input.attributes, input.config.roles)) continue;
    if (!best || c.score > best.score || (c.score === best.score && c.championId < best.championId)) best = c;
  }
  return best;
}

/**
 * Ranked picks with the explanation for the list: why #1 beats the player's usual pick
 * for this role, and how sure the coach is (from sample sizes and the score gap).
 */
export function advisePicks(input: RecommendInput, explain: ExplainConfig["settings"]): PickAdvice {
  const all = scoreCandidates(input).sort(byScore);
  const picks = all.slice(0, input.config.topN);
  const top = picks[0];
  if (!top) return { picks, whyNot: null, confidence: null };

  const topComfort = input.comfort.get(top.championId);
  const confidence = confidenceOf(
    { score: top.score, games: topComfort?.games ?? 0, masteryPoints: topComfort?.masteryPoints ?? 0 },
    picks[1],
    explain,
  );

  let whyNot: Reason | null = null;
  const usual = usualPick(input);
  if (usual && usual.championId !== top.championId) {
    const champion = usual.championId;
    const pickable = new Set(input.pickable);
    const scored = all.find((p) => p.championId === champion);
    if (input.unavailable.has(champion)) whyNot = reason("whyNot.unavailable", { champion });
    else if (pickable.size && !pickable.has(champion)) whyNot = reason("whyNot.notPickable", { champion });
    else if (scored?.offMeta && !top.offMeta && input.role) whyNot = reason("whyNot.offMeta", { champion, role: input.role });
    else if (scored && (top.factors.teamNeeds ?? 0) > (scored.factors.teamNeeds ?? 0)) {
      const need = top.reasons.find((r) => r.id.startsWith("team."));
      if (need) whyNot = reason(`whyNot.${need.id}`, { champion });
    }
  }
  return { picks, whyNot, confidence };
}
