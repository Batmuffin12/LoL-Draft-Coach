import type { ChampionId, Position } from "@ldc/shared";
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

/** Weighted mean over components that have a value; weights re-normalised. */
export function mixAvailable(parts: { value: number | null; weight: number }[]): number {
  let sum = 0;
  let total = 0;
  for (const p of parts) {
    if (p.value === null || p.weight <= 0) continue;
    sum += p.value * p.weight;
    total += p.weight;
  }
  return total > 0 ? sum / total : 0;
}

/** Mean of mastery milestone grades mapped onto the configured scale (0..1); null when none are known. */
export function gradeScore(grades: string[] | undefined, scale: string[]): number | null {
  const values = (grades ?? []).map((g) => scale.indexOf(g)).filter((i) => i >= 0);
  if (!values.length || scale.length < 2) return null;
  return values.reduce((s, i) => s + i, 0) / values.length / (scale.length - 1);
}

export const halfLifeWeight = (ageMs: number, halfLifeDays: number) =>
  Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * DAY_MS));

/** Smoothed win rate, and its [0, 1] score around the player's own average (0.5 = average). */
export function winComponent(
  wWins: number,
  w: number,
  base: number,
  cfg: Pick<EngineConfig["comfort"], "smoothingK" | "winRateSpread">,
): { smoothed: number; value: number } {
  const smoothed = (wWins + cfg.smoothingK * base) / (w + cfg.smoothingK);
  return { smoothed, value: clamp01(0.5 + (smoothed - base) / (2 * cfg.winRateSpread)) };
}

/**
 * Comfort per champion from the player's own history and mastery, as two signals:
 *
 * - **Champion skill** (any role, fades slowly): mastery points as a percentile of the
 *   player's pool (fading when the champion hasn't been played for a long time),
 *   mastery milestone grades, and a long-window win rate across all roles.
 * - **Current form** (this role, fades quickly): recent games and win rate; games in
 *   other roles count with form.offRoleGameWeight.
 *
 * Win rates are smoothed toward the player's own average: (wins + k·base) / (games + k).
 */
export function computeComfort(
  games: PlayerGame[],
  masteries: MasteryEntry[],
  now: number,
  cfg: EngineConfig["comfort"],
  role: Position | null = null,
): Map<ChampionId, ComfortStats> {
  const inRole = (g: PlayerGame) => !role || !g.position || g.position === role;
  const formWeight = (g: PlayerGame) =>
    halfLifeWeight(now - g.endedAt, cfg.form.halfLifeDays) * (inRole(g) ? 1 : cfg.form.offRoleGameWeight);
  const skillWeight = (g: PlayerGame) => halfLifeWeight(now - g.endedAt, cfg.skill.halfLifeDays);

  const average = (weight: (g: PlayerGame) => number) => {
    const total = games.reduce((s, g) => s + weight(g), 0);
    return total > 0 ? games.reduce((s, g) => s + (g.win ? weight(g) : 0), 0) / total : 0.5;
  };
  const formBase = average(formWeight);
  const skillBase = average(skillWeight);

  const byChamp = new Map<ChampionId, PlayerGame[]>();
  for (const g of games) byChamp.set(g.championId, [...(byChamp.get(g.championId) ?? []), g]);
  const masteryById = new Map(masteries.map((m) => [m.championId, m]));
  const allPoints = masteries.map((m) => m.points);
  const ids = new Set<ChampionId>([...byChamp.keys(), ...masteries.filter((m) => m.points > 0).map((m) => m.championId)]);
  const out = new Map<ChampionId, ComfortStats>();

  for (const id of ids) {
    const list = byChamp.get(id) ?? [];
    const mastery = masteryById.get(id);
    const sum = (f: (g: PlayerGame) => number) => list.reduce((s, g) => s + f(g), 0);

    // Champion skill: transfers across roles, fades slowly.
    const staleness = mastery?.lastPlayTime ? halfLifeWeight(now - mastery.lastPlayTime, cfg.skill.masteryStaleHalfLifeDays) : 1;
    const masteryValue = mastery && mastery.points > 0 ? percentile(mastery.points, allPoints) * staleness : null;
    const grades = gradeScore(mastery?.grades, cfg.skill.gradeScale);
    const longWin = list.length ? winComponent(sum((g) => (g.win ? skillWeight(g) : 0)), sum(skillWeight), skillBase, cfg).value : null;
    const skill = mixAvailable([
      { value: masteryValue, weight: cfg.skill.mix.mastery },
      { value: grades, weight: cfg.skill.mix.grades },
      { value: longWin, weight: cfg.skill.mix.winRate },
    ]);

    // Current form: this role, recent games.
    const w = sum(formWeight);
    const recent = winComponent(sum((g) => (g.win ? formWeight(g) : 0)), w, formBase, cfg);
    const experience = 1 - Math.exp(-w / cfg.experienceScaleGames);
    const form = mixAvailable([
      { value: recent.value, weight: cfg.form.mix.winRate },
      { value: experience, weight: cfg.form.mix.experience },
    ]);

    const roleList = role ? list.filter((g) => g.position === role) : [];
    // A role you never played it in: only part of what you know about the champion carries over.
    const roleShare = role && !roleList.length ? cfg.unplayedRoleShare : 1;
    const score =
      roleShare *
      mixAvailable([
        { value: skill, weight: cfg.mix.skill },
        { value: form, weight: cfg.mix.form },
      ]);
    const gamesByPosition: Record<string, number> = {};
    for (const g of list) if (g.position) gamesByPosition[g.position] = (gamesByPosition[g.position] ?? 0) + 1;
    const wins = list.filter((g) => g.win).length;

    out.set(id, {
      championId: id,
      games: list.length,
      weightedGames: w,
      winRate: list.length ? wins / list.length : null,
      smoothedWinRate: recent.smoothed,
      masteryLevel: mastery?.level ?? null,
      masteryPoints: mastery?.points ?? 0,
      grades: mastery?.grades ?? [],
      skill: clamp01(skill),
      form: clamp01(form),
      score: clamp01(score),
      gamesByPosition,
      role,
      gamesInRole: role ? roleList.length : null,
      winRateInRole: role && roleList.length ? roleList.filter((g) => g.win).length / roleList.length : null,
    });
  }
  return out;
}
