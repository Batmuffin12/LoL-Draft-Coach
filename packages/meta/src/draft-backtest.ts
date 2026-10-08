import { assessPick, MetaIndex, winOf, type EngineConfig, type LiveInput } from "@ldc/engine";
import { TERM_NAMES, type MatchSummary, type RankBandId, type TermName } from "@ldc/shared";
import { BandAggregator } from "./aggregate";
import type { AggregationConfig } from "./config";
import { draftFor, withoutPersonal, type Prediction } from "./backtest";

/**
 * Draft-level backtest: one prediction per game (blue side wins), so games are independent
 * samples, plus the tools to decide whether a tuning is needed: baselines, a time split with a
 * validation fold, term weights fitted by logistic regression, and paired bootstrap intervals.
 */

/** The terms the meta can measure (personal is off: collected players are anonymous). */
export const DRAFT_TERMS = TERM_NAMES.filter((t) => t !== "personal");
export type DraftTerm = (typeof DRAFT_TERMS)[number];

/** One game seen by the engine: per term, blue's rating points minus red's (averaged over picks). */
export interface DraftGame {
  matchId: string;
  blueWon: boolean;
  x: Record<DraftTerm, number>;
}

/** Splits by time: oldest `1 − valid − test` to train, then validation, newest to test. */
export function splitByTime(matches: MatchSummary[], validShare: number, testShare: number) {
  const sorted = [...matches].sort((a, b) => a.endedAt - b.endedAt);
  const a = Math.floor(sorted.length * (1 - validShare - testShare));
  const b = Math.floor(sorted.length * (1 - testShare));
  return { train: sorted.slice(0, a), valid: sorted.slice(a, b), test: sorted.slice(b) };
}

/** The band's meta index as of the newest game in `train` (what the app would have had then). */
export function indexAsOf(train: MatchSummary[], band: RankBandId, aggregation: AggregationConfig, engine: EngineConfig, metrics: string[] = []): MetaIndex {
  const now = train.length ? Math.max(...train.map((m) => m.endedAt)) + 1 : 0;
  const agg = new BandAggregator({ band, now, config: aggregation, metrics });
  for (const m of [...train].sort((x, y) => y.endedAt - x.endedAt)) agg.add(m);
  return new MetaIndex(agg.finish(), withoutPersonal(engine).rating);
}

/**
 * Each game's term features: every player's pick is scored as if they picked last (as in
 * `predict`), and a term's feature is the mean over the ten picks of its rating points, signed
 * for blue. With every weight 1 and no intercept, the game's prediction is the engine's average
 * view of the draft.
 */
export function draftGames(index: MetaIndex, matches: MatchSummary[], band: RankBandId, engine: EngineConfig): DraftGame[] {
  const cfg = withoutPersonal(engine);
  const out: DraftGame[] = [];
  for (const m of matches) {
    if (!m.participants.every((p) => p.position)) continue;
    const blueTeam = Math.min(...m.participants.map((p) => p.teamId));
    const x = Object.fromEntries(DRAFT_TERMS.map((t) => [t, 0])) as Record<DraftTerm, number>;
    m.participants.forEach((p, i) => {
      const input: LiveInput = {
        draft: draftFor(m, i),
        pickable: [p.championId],
        unavailable: new Set(m.participants.filter((_, j) => j !== i).map((q) => q.championId)),
        comfort: new Map(),
        attributes: new Map(),
        intendedPositions: new Map(),
        role: p.position,
        weights: cfg.bands[String(band)] ?? Object.values(cfg.bands)[0]!,
        config: cfg,
        index,
        band,
      };
      const sign = p.teamId === blueTeam ? 1 : -1;
      for (const t of assessPick(input, p.championId).terms ?? []) {
        if (t.name in x) x[t.name as DraftTerm] += (sign * t.rating) / m.participants.length;
      }
    });
    const blueWon = m.participants.find((p) => p.teamId === blueTeam)!.win;
    out.push({ matchId: m.matchId, blueWon, x });
  }
  return out;
}

/** Term weights (multipliers on the engine's rating points) and a blue-side intercept in rating points. */
export interface DraftModel {
  intercept: number;
  weights: Record<DraftTerm, number>;
}

export const ENGINE_AS_IS: DraftModel = { intercept: 0, weights: Object.fromEntries(DRAFT_TERMS.map((t) => [t, 1])) as Record<DraftTerm, number> };

/** The same model with only these terms (the others weigh 0). */
export function only(model: DraftModel, keep: readonly DraftTerm[]): DraftModel {
  return { ...model, weights: Object.fromEntries(DRAFT_TERMS.map((t) => [t, keep.includes(t) ? model.weights[t] : 0])) as Record<DraftTerm, number> };
}

export function predictDrafts(games: DraftGame[], model: DraftModel): Prediction[] {
  return games.map((g) => ({
    p: winOf(model.intercept + DRAFT_TERMS.reduce((s, t) => s + model.weights[t] * g.x[t], 0)),
    won: g.blueWon,
    matchId: g.matchId,
  }));
}

/** Blue's win rate in `games` as an intercept (rating points): the side-only baseline. */
export function sideOnly(games: DraftGame[]): DraftModel {
  const blue = games.filter((g) => g.blueWon).length;
  const rate = (blue + 1) / (games.length + 2);
  return { intercept: 400 * Math.log10(rate / (1 - rate)), weights: only(ENGINE_AS_IS, []).weights };
}

/**
 * Fits the intercept and term weights by logistic regression (Newton's method), with an L2
 * penalty pulling each weight toward 1 (the engine as designed), so a small sample can't
 * swing a weight far on noise. `l2` is in games: how many games' worth of evidence a weight
 * of 1 counts as.
 */
export function fitDraftModel(games: DraftGame[], l2 = 200, iterations = 25): DraftModel {
  const k = Math.LN10 / 400; // rating points → natural log-odds
  const dims = DRAFT_TERMS.length + 1;
  const beta = [0, ...DRAFT_TERMS.map(() => 1)];
  const feats = games.map((g) => [1, ...DRAFT_TERMS.map((t) => k * g.x[t])]);
  // Rating-point features carry k inside; the intercept is in log-odds and converted back at the end.
  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(dims).fill(0);
    const hess = Array.from({ length: dims }, () => new Array<number>(dims).fill(0));
    games.forEach((g, n) => {
      const f = feats[n]!;
      const z = f.reduce((s, v, j) => s + v * beta[j]!, 0);
      const p = 1 / (1 + Math.exp(-z));
      const y = g.blueWon ? 1 : 0;
      for (let a = 0; a < dims; a++) {
        grad[a]! += (p - y) * f[a]!;
        for (let b = 0; b < dims; b++) hess[a]![b]! += p * (1 - p) * f[a]! * f[b]!;
      }
    });
    // Penalty toward 1 on the term weights, scaled so l2 games of typical feature size anchor them.
    const scale = Math.max(1e-9, feats.reduce((s, f) => s + f.slice(1).reduce((q, v) => q + v * v, 0), 0) / Math.max(1, games.length * (dims - 1)));
    for (let a = 1; a < dims; a++) {
      grad[a]! += l2 * scale * (beta[a]! - 1);
      hess[a]![a]! += l2 * scale;
    }
    hess[0]![0]! += 1e-6;
    const step = solve(hess, grad);
    if (!step) break;
    let moved = 0;
    for (let a = 0; a < dims; a++) {
      beta[a]! -= step[a]!;
      moved = Math.max(moved, Math.abs(step[a]!));
    }
    if (moved < 1e-7) break;
  }
  return {
    intercept: beta[0]! / k,
    weights: Object.fromEntries(DRAFT_TERMS.map((t, i) => [t, beta[i + 1]!])) as Record<DraftTerm, number>,
  };
}

/** Solves A·x = b by Gaussian elimination with partial pivoting (small systems); null if singular. */
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

/**
 * 95% interval of mean log-loss(A) − log-loss(B) over the same games (paired bootstrap).
 * Entirely below 0: A really predicts better than B on this sample.
 */
export function pairedLogLossInterval(a: Prediction[], b: Prediction[], iterations = 1000, seed = 7): [number, number] {
  const n = Math.min(a.length, b.length);
  if (!n) return [NaN, NaN];
  const ll = (p: Prediction) => {
    const q = Math.min(1 - 1e-6, Math.max(1e-6, p.p));
    return -(p.won ? Math.log(q) : Math.log(1 - q));
  };
  const diff = Array.from({ length: n }, (_, i) => ll(a[i]!) - ll(b[i]!));
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const means: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += diff[Math.floor(random() * n)]!;
    means.push(sum / n);
  }
  means.sort((x, y) => x - y);
  return [means[Math.floor(iterations * 0.025)]!, means[Math.floor(iterations * 0.975)]!];
}

/**
 * Expected calibration error: predictions in `bins` equal-count groups; the mean gap between
 * predicted and actual win rate, weighted by group size (0 = perfectly calibrated).
 */
export function expectedCalibrationError(preds: Prediction[], bins = 10): number {
  if (!preds.length) return NaN;
  const sorted = [...preds].sort((a, b) => a.p - b.p);
  let err = 0;
  for (let i = 0; i < bins; i++) {
    const g = sorted.slice(Math.floor((i * sorted.length) / bins), Math.floor(((i + 1) * sorted.length) / bins));
    if (!g.length) continue;
    const predicted = g.reduce((s, x) => s + x.p, 0) / g.length;
    const actual = g.filter((x) => x.won).length / g.length;
    err += (g.length / sorted.length) * Math.abs(predicted - actual);
  }
  return err;
}

