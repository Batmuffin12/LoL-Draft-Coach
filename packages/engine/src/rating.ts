/**
 * Rating points, as in Elo and the open-source DraftGap: rating(w) = 400·log10(w / (1 − w)).
 * Ratings add up, so each factor can be a change over what was already expected, and the
 * sum maps back to a win chance. Near 50%, one point of win rate is about 7 rating points.
 */

const EPS = 1e-4;

/** Rating points of a win chance (clamped away from 0 and 1). */
export function rating(winChance: number): number {
  const w = Math.min(1 - EPS, Math.max(EPS, winChance));
  return 400 * Math.log10(w / (1 - w));
}

/** Win chance of a rating total. */
export function winOf(points: number): number {
  return 1 / (1 + Math.pow(10, -points / 400));
}

/** A rating change expressed as a change in win chance at 50% (e.g. 14 points → +0.02). */
export function deltaWin(points: number): number {
  return winOf(points) - 0.5;
}

/** Wins over games, pulled toward `expected` with `prior` imaginary games (Bayesian smoothing). */
export function smoothRate(wins: number, games: number, expected: number, prior: number): number {
  return games + prior > 0 ? (wins + prior * expected) / (games + prior) : expected;
}

/** The q-quantile (0..1) of values with weights (lowest first); 0 for no values. */
export function weightedQuantile(items: { value: number; weight: number }[], q: number): number {
  const sorted = items.filter((i) => i.weight > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  if (!total) return 0;
  let acc = 0;
  for (const i of sorted) {
    acc += i.weight;
    if (acc >= q * total) return i.value;
  }
  return sorted[sorted.length - 1]!.value;
}
