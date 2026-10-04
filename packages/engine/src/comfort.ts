import type { ChampionId } from "@ldc/shared";
import type { EngineConfig } from "./config";
import type { ComfortStats, MasteryEntry, PlayerGame } from "./types";

const DAY_MS = 86_400_000;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Fraction of values strictly below `v`, plus half of the ties (mid-rank percentile). */
export function percentile(v: number, all: number[]): number {
  if (all.length <= 1) return all.length === 1 ? 0.5 : 0;
  let below = 0;
  let equal = 0;
  for (const x of all) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + (equal - 1) / 2) / (all.length - 1);
}

/**
 * Comfort factor per champion from the player's own history and mastery.
 * - Win rate: recency-weighted (half-life from config), smoothed toward the player's
 *   own overall win rate with k from config: (wins + k·base) / (games + k).
 * - Experience: 1 − e^(−weightedGames / scale).
 * - Mastery: percentile of mastery points among the player's champions.
 */
export function computeComfort(
  games: PlayerGame[],
  masteries: MasteryEntry[],
  now: number,
  cfg: EngineConfig["comfort"],
): Map<ChampionId, ComfortStats> {
  const halfLifeMs = cfg.recencyHalfLifeDays * DAY_MS;
  const weight = (g: PlayerGame) => Math.pow(0.5, Math.max(0, now - g.endedAt) / halfLifeMs);

  const totalW = games.reduce((s, g) => s + weight(g), 0);
  const base = totalW > 0 ? games.reduce((s, g) => s + (g.win ? weight(g) : 0), 0) / totalW : 0.5;

  const byChamp = new Map<ChampionId, PlayerGame[]>();
  for (const g of games) byChamp.set(g.championId, [...(byChamp.get(g.championId) ?? []), g]);
  const masteryById = new Map(masteries.map((m) => [m.championId, m]));
  const allPoints = masteries.map((m) => m.points);

  const ids = new Set<ChampionId>([...byChamp.keys(), ...masteries.filter((m) => m.points > 0).map((m) => m.championId)]);
  const mixTotal = cfg.mix.winRate + cfg.mix.experience + cfg.mix.mastery || 1;
  const out = new Map<ChampionId, ComfortStats>();

  for (const id of ids) {
    const list = byChamp.get(id) ?? [];
    const w = list.reduce((s, g) => s + weight(g), 0);
    const wWins = list.reduce((s, g) => s + (g.win ? weight(g) : 0), 0);
    const smoothed = (wWins + cfg.smoothingK * base) / (w + cfg.smoothingK);
    const wins = list.filter((g) => g.win).length;
    const mastery = masteryById.get(id);

    const winComponent = clamp01(0.5 + (smoothed - base) / (2 * cfg.winRateSpread));
    const experience = 1 - Math.exp(-w / cfg.experienceScaleGames);
    const masteryComponent = mastery && mastery.points > 0 ? percentile(mastery.points, allPoints) : 0;
    const score =
      (cfg.mix.winRate * winComponent + cfg.mix.experience * experience + cfg.mix.mastery * masteryComponent) / mixTotal;

    const gamesByPosition: Record<string, number> = {};
    for (const g of list) if (g.position) gamesByPosition[g.position] = (gamesByPosition[g.position] ?? 0) + 1;

    out.set(id, {
      championId: id,
      games: list.length,
      weightedGames: w,
      winRate: list.length ? wins / list.length : null,
      smoothedWinRate: smoothed,
      masteryLevel: mastery?.level ?? null,
      masteryPoints: mastery?.points ?? 0,
      score: clamp01(score),
      gamesByPosition,
    });
  }
  return out;
}
