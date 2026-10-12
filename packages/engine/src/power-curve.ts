import type { ChampionAttributes } from "@ldc/shared";

/**
 * A champion's measured power curve as a gap (long-game minus short-game win rate), or null when
 * it can't be told from chance: too few games on either side, a gap under `minGap`, or a gap
 * under `minZ` standard errors of the two win rates (111 and 225 games move it by ~±6 points).
 */
export function curveGap(pc: ChampionAttributes["powerCurve"] | undefined, minGames: number, minGap: number, minZ: number): number | null {
  if (!pc || pc.early.games < minGames || pc.late.games < minGames) return null;
  const gap = pc.late.winRate - pc.early.winRate;
  const variance = (r: { games: number; winRate: number }) => (r.winRate * (1 - r.winRate)) / r.games;
  const se = Math.sqrt(variance(pc.early) + variance(pc.late));
  if (Math.abs(gap) < minGap || (se > 0 && Math.abs(gap) / se < minZ)) return null;
  return gap;
}
