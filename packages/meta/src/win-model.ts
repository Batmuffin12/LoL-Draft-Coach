import { ITEM_BOUGHT, type MatchSummary } from "@ldc/shared";
import type { Prediction } from "./backtest";

/**
 * In-game win chance from what the scoreboard shows (milestone 10): learned from collected
 * timelines, applied to the Live Client Data API's view of a game. Riot: "Products must not use or
 * incorporate information not present in the game client", so the model reads only what every
 * player sees: deaths, champion levels, CS, the items each player holds (their gold value from Data
 * Dragon) and epic monsters taken. Never gold, which the client hides for enemies.
 *
 * One logistic regression per checkpoint minute (blue minus red for every feature, plus a side
 * intercept); between checkpoints the nearest earlier one applies.
 */
export const WIN_FEATURES = ["kills", "levels", "cs", "itemGold", "monsters"] as const;
export type WinFeature = (typeof WIN_FEATURES)[number];

export interface WinModel {
  /** Checkpoint minutes, ascending. */
  minutes: number[];
  /** Per checkpoint: [intercept, ...one weight per feature] in natural log-odds per feature unit. */
  weights: number[][];
  features: readonly WinFeature[];
}

/**
 * The scoreboard at `minute`, blue minus red: team kills (the other team's deaths), level sum,
 * CS / 10, held items' value / 1000 gold, epic monsters. Null when the timeline doesn't reach it.
 */
export function scoreboardAt(match: MatchSummary, minute: number, itemGold: (id: number) => number): number[] | null {
  const t = match.timeline;
  if (!t?.levels || !t.cs || !t.kills || !t.monsters) return null;
  if ((t.levels[0]?.length ?? 0) <= minute || match.durationSec < minute * 60) return null;
  const sec = minute * 60;
  const blueTeam = Math.min(...match.participants.map((p) => p.teamId));
  const sign = (i: number) => (match.participants[i]?.teamId === blueTeam ? 1 : -1);
  let kills = 0;
  for (const [s, , victim] of t.kills) if (s <= sec) kills -= sign(victim);
  let levels = 0;
  let cs = 0;
  match.participants.forEach((_, i) => {
    levels += sign(i) * (t.levels![i]?.[minute] ?? 0);
    cs += sign(i) * (t.cs![i]?.[minute] ?? 0);
  });
  const held = match.participants.map(() => new Map<number, number>());
  for (const [i, s, kind, id] of t.items) {
    if (s > sec) break;
    const bag = held[i];
    if (!bag) continue;
    if (kind === ITEM_BOUGHT) bag.set(id, (bag.get(id) ?? 0) + 1);
    else if ((bag.get(id) ?? 0) > 0) bag.set(id, bag.get(id)! - 1);
  }
  let gold = 0;
  held.forEach((bag, i) => {
    for (const [id, n] of bag) gold += sign(i) * n * itemGold(id);
  });
  let monsters = 0;
  for (const [s, , , team] of t.monsters) if (s <= sec) monsters += team === blueTeam ? 1 : -1;
  return [kills, levels, cs / 10, gold / 1000, monsters];
}

const blueWon = (m: MatchSummary) => m.participants.find((p) => p.teamId === Math.min(...m.participants.map((q) => q.teamId)))!.win;

/** Logistic regression by Newton's method with a small L2 penalty on the weights (not the intercept). */
export function fitLogistic(rows: number[][], y: boolean[], l2 = 1, iterations = 30): number[] {
  const d = (rows[0]?.length ?? 0) + 1;
  const beta = new Array<number>(d).fill(0);
  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(d).fill(0);
    const hess = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    rows.forEach((r, n) => {
      const f = [1, ...r];
      const p = 1 / (1 + Math.exp(-f.reduce((s, v, j) => s + v * beta[j]!, 0)));
      const e = p - (y[n] ? 1 : 0);
      const w = p * (1 - p);
      for (let a = 0; a < d; a++) {
        grad[a]! += e * f[a]!;
        for (let b = 0; b < d; b++) hess[a]![b]! += w * f[a]! * f[b]!;
      }
    });
    for (let a = 1; a < d; a++) {
      grad[a]! += l2 * beta[a]!;
      hess[a]![a]! += l2;
    }
    hess[0]![0]! += 1e-9;
    const step = solve(hess, grad);
    if (!step) break;
    let moved = 0;
    for (let a = 0; a < d; a++) {
      beta[a]! -= step[a]!;
      moved = Math.max(moved, Math.abs(step[a]!));
    }
    if (moved < 1e-9) break;
  }
  return beta;
}

function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Fits one regression per checkpoint minute on every game whose timeline reaches it (one pass, so `matches` can stream). */
export function fitWinModel(matches: Iterable<MatchSummary>, minutes: number[], itemGold: (id: number) => number): WinModel {
  const rows = minutes.map(() => ({ x: [] as number[][], y: [] as boolean[] }));
  for (const m of matches) {
    minutes.forEach((minute, k) => {
      const x = scoreboardAt(m, minute, itemGold);
      if (!x) return;
      rows[k]!.x.push(x);
      rows[k]!.y.push(blueWon(m));
    });
  }
  const weights = rows.map((r) => (r.x.length >= 50 ? fitLogistic(r.x, r.y) : [0, ...WIN_FEATURES.map(() => 0)]));
  return { minutes: [...minutes], weights, features: WIN_FEATURES };
}

/** Blue's win chance for a scoreboard (blue minus red, as scoreboardAt) at `minute`. */
export function winChance(model: WinModel, minute: number, x: number[]): number {
  let k = 0;
  while (k + 1 < model.minutes.length && model.minutes[k + 1]! <= minute) k++;
  const w = model.weights[k]!;
  const z = w[0]! + x.reduce((s, v, i) => s + v * w[i + 1]!, 0);
  return 1 / (1 + Math.exp(-z));
}

/** The model's predictions at `minute` for held-out games, and the side-only baseline on the same games. */
export function winModelPredictions(model: WinModel, test: MatchSummary[], minute: number, itemGold: (id: number) => number): { model: Prediction[]; side: Prediction[] } {
  const out = { model: [] as Prediction[], side: [] as Prediction[] };
  const k = model.minutes.indexOf(minute);
  const side = 1 / (1 + Math.exp(-(model.weights[k]?.[0] ?? 0)));
  for (const m of test) {
    const x = scoreboardAt(m, minute, itemGold);
    if (!x) continue;
    const won = blueWon(m);
    out.model.push({ p: winChance(model, minute, x), won, matchId: m.matchId });
    out.side.push({ p: side, won, matchId: m.matchId });
  }
  return out;
}
