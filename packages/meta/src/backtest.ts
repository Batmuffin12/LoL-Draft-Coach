import { assessPick, MetaIndex, type EngineConfig, type LiveInput } from "@ldc/engine";
import type { DraftSlot, DraftState, MatchSummary, RankBandId, TermName } from "@ldc/shared";
import { BandAggregator } from "./aggregate";
import type { AggregationConfig } from "./config";

/** One prediction: the engine's win chance for a player's pick, and what happened. */
export interface Prediction {
  p: number;
  won: boolean;
  /** The game it came from: the ten picks of one game are not independent. */
  matchId?: string;
}

export interface Scores {
  n: number;
  /** Mean negative log-likelihood (lower is better; a coin flip scores ln 2 ≈ 0.693). */
  logLoss: number;
  /** Mean squared error of the probability (lower is better; a coin flip scores 0.25). */
  brier: number;
  /** Predictions that lean one way (not exactly 50%), and the share of those on the right side. */
  decided: number;
  accuracy: number;
}

export interface CalibrationBin {
  /** Predicted range, e.g. [0.45, 0.5). */
  from: number;
  to: number;
  n: number;
  meanPredicted: number;
  actualWinRate: number;
}

export function score(preds: Prediction[]): Scores {
  const n = preds.length;
  if (!n) return { n, logLoss: NaN, brier: NaN, decided: 0, accuracy: NaN };
  let ll = 0;
  let brier = 0;
  let right = 0;
  let decided = 0;
  for (const { p, won } of preds) {
    ll -= logLikelihood(p, won);
    brier += (p - (won ? 1 : 0)) ** 2;
    if (Math.abs(p - 0.5) > 1e-9) {
      decided++;
      if (p > 0.5 === won) right++;
    }
  }
  return { n, logLoss: ll / n, brier: brier / n, decided, accuracy: decided ? right / decided : NaN };
}

function logLikelihood(p: number, won: boolean): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return won ? Math.log(q) : Math.log(1 - q);
}

/** A small seeded random generator (mulberry32), so reports are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 95% interval of (log-loss − a coin flip's), resampling whole games (bootstrap), since
 * one game's ten picks move together. Entirely below 0: the engine really beats a coin flip.
 */
export function logLossGainInterval(preds: Prediction[], iterations = 1000, seed = 1): [number, number] {
  const games = new Map<string, Prediction[]>();
  preds.forEach((p, i) => {
    const k = p.matchId ?? `#${i}`;
    games.set(k, [...(games.get(k) ?? []), p]);
  });
  const list = [...games.values()];
  if (!list.length) return [NaN, NaN];
  const random = seeded(seed);
  const deltas: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let ll = 0;
    let n = 0;
    for (let g = 0; g < list.length; g++) {
      for (const p of list[Math.floor(random() * list.length)]!) {
        ll -= logLikelihood(p.p, p.won);
        n++;
      }
    }
    deltas.push(ll / n - Math.log(2));
  }
  deltas.sort((a, b) => a - b);
  return [deltas[Math.floor(iterations * 0.025)]!, deltas[Math.floor(iterations * 0.975)]!];
}

/** Predictions bucketed by predicted value, to see whether "55%" wins about 55% of the time. */
export function calibration(preds: Prediction[], width = 0.025): CalibrationBin[] {
  const bins = new Map<number, Prediction[]>();
  for (const pr of preds) {
    const k = Math.floor(pr.p / width);
    bins.set(k, [...(bins.get(k) ?? []), pr]);
  }
  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, list]) => ({
      from: k * width,
      to: (k + 1) * width,
      n: list.length,
      meanPredicted: list.reduce((s, x) => s + x.p, 0) / list.length,
      actualWinRate: list.filter((x) => x.won).length / list.length,
    }));
}

/**
 * The engine's view of one player's pick in a finished match, as if they had picked last:
 * allies with their positions, enemies without (inferred, as in ranked), no personal data
 * (collected players are anonymous, so that term is switched off).
 */
export function draftFor(match: MatchSummary, i: number): DraftState {
  const me = match.participants[i]!;
  const slot = (p: MatchSummary["participants"][number], cellId: number, mine: boolean): DraftSlot => ({
    cellId,
    championId: p.championId,
    pickIntentId: 0,
    position: mine ? p.position : "",
    isLocalPlayer: false,
  });
  const allies = match.participants.map((p, j) => ({ p, j })).filter(({ p }) => p.teamId === me.teamId);
  const enemies = match.participants.map((p, j) => ({ p, j })).filter(({ p }) => p.teamId !== me.teamId);
  const myTeam = allies.map(({ p, j }) => ({ ...slot(p, j, true), championId: j === i ? 0 : p.championId, isLocalPlayer: j === i }));
  return {
    timerPhase: "BAN_PICK",
    timeLeftMs: 0,
    isCustomGame: false,
    localCellId: i,
    myTeam,
    theirTeam: enemies.map(({ p, j }) => slot(p, j, false)),
    myBans: [],
    theirBans: [],
    actions: [],
  };
}

/** Engine config with the personal term off (no player history in collected matches). */
export function withoutPersonal(cfg: EngineConfig): EngineConfig {
  return { ...cfg, rating: { ...cfg.rating, personal: { ...cfg.rating.personal, comfortScale: 0, learningPenalty: 0, experience: undefined, skill: undefined } } };
}

/** The same config with some terms weighted 0 in every band (for ablations). */
export function onlyTerms(cfg: EngineConfig, keep: TermName[]): EngineConfig {
  const bands = Object.fromEntries(
    Object.entries(cfg.rating.bands).map(([b, w]) => [b, Object.fromEntries(Object.entries(w).map(([t, v]) => [t, keep.includes(t as TermName) ? v : 0])) as typeof w]),
  );
  return { ...cfg, rating: { ...cfg.rating, bands } };
}

/** Predicts every positioned participant of `test` from a snapshot built on `train`. */
export function predict(index: MetaIndex, test: MatchSummary[], band: RankBandId, engine: EngineConfig): Prediction[] {
  const out: Prediction[] = [];
  for (const m of test) {
    if (!m.participants.every((p) => p.position)) continue;
    m.participants.forEach((p, i) => {
      const draft = draftFor(m, i);
      const input: LiveInput = {
        draft,
        pickable: [p.championId],
        unavailable: new Set(m.participants.filter((_, j) => j !== i).map((x) => x.championId)),
        comfort: new Map(),
        attributes: new Map(),
        intendedPositions: new Map(),
        role: p.position,
        weights: engine.bands[String(band)] ?? Object.values(engine.bands)[0]!,
        config: engine,
        index,
        band,
      };
      out.push({ p: assessPick(input, p.championId).expectedWin!, won: p.win, matchId: m.matchId });
    });
  }
  return out;
}

export interface BacktestInput {
  band: RankBandId;
  /** Collected matches of the band, any order. */
  matches: MatchSummary[];
  /** Newest share of matches held out for testing (0..1). */
  testShare: number;
  aggregation: AggregationConfig;
  engine: EngineConfig;
  metrics?: string[];
}

export interface Backtest {
  train: number;
  test: number;
  index: MetaIndex;
  testMatches: MatchSummary[];
  engine: EngineConfig;
}

/** Splits by time (older = train, newest = test) and builds the train snapshot as of the split. */
export function prepareBacktest(input: BacktestInput): Backtest {
  const sorted = [...input.matches].sort((a, b) => a.endedAt - b.endedAt);
  const cut = Math.floor(sorted.length * (1 - input.testShare));
  const train = sorted.slice(0, cut);
  const testMatches = sorted.slice(cut);
  const now = train.length ? train[train.length - 1]!.endedAt + 1 : 0;
  const agg = new BandAggregator({ band: input.band, now, config: input.aggregation, metrics: input.metrics ?? [] });
  for (const m of [...train].reverse()) agg.add(m);
  const engine = withoutPersonal(input.engine);
  return { train: train.length, test: testMatches.length, index: new MetaIndex(agg.finish(), engine.rating), testMatches, engine };
}
