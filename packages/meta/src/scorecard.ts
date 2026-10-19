import { chooseOption, rating, winOf, type EngineConfig, type LoadoutConfig, type MetaIndex } from "@ldc/engine";
import { TERM_NAMES, type ChampionBuild, type MatchSummary, type RankBandId, type UserMatch } from "@ldc/shared";
import type { AggregationConfig } from "./config";
import { score, type Prediction } from "./backtest";
import { DRAFT_TERMS, draftGames, expectedCalibrationError, indexAsOf, pairedLogLossInterval } from "./draft-backtest";
import { personalGames, personalPredictions } from "./personal-backtest";

/**
 * The engine scorecard (research/engine-eval): a few numbers that say whether a change makes the
 * advice better or worse, judged on games the change never saw (rolling time folds), with 95%
 * intervals. One run scores the current config; with a candidate config, the same games are scored
 * twice and the difference is paired, which is far more sensitive than comparing two runs.
 */

/** One number of the scorecard. `better` says which way is good; `info` numbers are context only. */
export interface Metric {
  value: number;
  n: number;
  better: "lower" | "higher" | "info";
  /** 95% interval, when the number has one. */
  lo?: number;
  hi?: number;
}

export type Metrics = Record<string, Metric>;

const metric = (value: number, n: number, better: Metric["better"], ci?: [number, number]): Metric =>
  ci ? { value, n, better, lo: ci[0], hi: ci[1] } : { value, n, better };

/** Area under the ROC curve: the chance a random winner got a higher prediction than a random loser. */
export function auc(preds: Prediction[]): number {
  const sorted = [...preds].sort((a, b) => a.p - b.p);
  let rankSum = 0;
  let pos = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j]!.p === sorted[i]!.p) j++;
    const avgRank = (i + j + 1) / 2; // ranks are 1-based; ties share the mean rank
    for (let k = i; k < j; k++) if (sorted[k]!.won) {
      rankSum += avgRank;
      pos++;
    }
    i = j;
  }
  const neg = sorted.length - pos;
  return pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : NaN;
}

/**
 * Calibration slope: the logistic regression of the result on the prediction's log-odds. 1 = the
 * predictions are as spread as they should be; above 1, the engine is too timid (its terms could
 * weigh more); below 1, too bold.
 */
export function calibrationSlope(preds: Prediction[]): number {
  const z = preds.map((x) => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, x.p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, x.p)))));
  let a = 0;
  let b = 1;
  for (let it = 0; it < 30; it++) {
    let g0 = 0, g1 = 0, h00 = 1e-9, h01 = 0, h11 = 1e-9;
    preds.forEach((x, i) => {
      const p = 1 / (1 + Math.exp(-(a + b * z[i]!)));
      const r = p - (x.won ? 1 : 0);
      const w = p * (1 - p);
      g0 += r;
      g1 += r * z[i]!;
      h00 += w;
      h01 += w * z[i]!;
      h11 += w * z[i]! * z[i]!;
    });
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  return b;
}

/** Predictions of one draft run: per game (blue wins), the side-only baseline on the same games, and per pick. */
export interface DraftRun {
  games: Prediction[];
  side: Prediction[];
  picks: Prediction[];
  folds: number;
  foldGames: number;
  /** The champion-strength prior the newest fold's snapshot used (configured or estimated). */
  metaPrior: number;
}

/**
 * Rolling-origin draft test: the newest `folds` blocks of `foldGames` games are each predicted
 * from a snapshot of every game before the block (what the app had then). A game's prediction is
 * blue's side rate plus, for each pick, the rating points of the terms in the shown chance
 * (config inChance), blue's minus red's.
 */
export function draftRun(
  matches: MatchSummary[],
  band: RankBandId,
  aggregation: AggregationConfig,
  engine: EngineConfig,
  metrics: string[] = [],
  opts: { folds?: number; foldGames?: number } = {},
): DraftRun {
  const sorted = matches.filter((m) => m.participants.every((p) => p.position)).sort((a, b) => a.endedAt - b.endedAt);
  const folds = opts.folds ?? 3;
  // At most 4,000 games a fold, and at least half the games before the first fold.
  const foldGames = opts.foldGames ?? Math.max(1, Math.min(4000, Math.floor(sorted.length / (2 * folds))));
  const counted = new Set<string>((engine.rating.inChance ?? TERM_NAMES).filter((t) => t !== "personal"));
  const run: DraftRun = { games: [], side: [], picks: [], folds, foldGames, metaPrior: engine.rating.priorGames.meta };
  for (let f = 0; f < folds; f++) {
    const start = sorted.length - (folds - f) * foldGames;
    if (start <= 0) continue;
    const train = sorted.slice(0, start);
    const test = sorted.slice(start, start + foldGames);
    const index = indexAsOf(train, band, aggregation, engine, metrics);
    run.metaPrior = index.metaPrior;
    const blueTeam = (m: MatchSummary) => Math.min(...m.participants.map((p) => p.teamId));
    const blueWins = train.filter((m) => m.participants.find((p) => p.teamId === blueTeam(m))!.win).length;
    const side = rating((blueWins + 1) / (train.length + 2));
    for (const g of draftGames(index, test, band, engine)) {
      const x = DRAFT_TERMS.reduce((s, t) => s + (counted.has(t) ? g.x[t] : 0), 0);
      run.games.push({ p: winOf(side + x), won: g.blueWon, matchId: g.matchId });
      run.side.push({ p: winOf(side), won: g.blueWon, matchId: g.matchId });
      run.picks.push(...g.picks);
    }
  }
  return run;
}

/** Scorecard numbers of a draft run, keyed under `prefix` (e.g. "draft.b2"). */
export function draftMetrics(run: DraftRun, prefix: string): Metrics {
  const s = score(run.games);
  const side = score(run.side);
  const n = run.games.length;
  const near = run.picks.filter((x) => Math.abs(x.p - 0.5) <= 0.025).length;
  return {
    [`${prefix}.gainVsSide`]: metric(s.logLoss - side.logLoss, n, "lower", pairedLogLossInterval(run.games, run.side)),
    [`${prefix}.logLoss`]: metric(s.logLoss, n, "lower"),
    [`${prefix}.accuracy`]: metric(s.accuracy, s.decided, "higher"),
    [`${prefix}.auc`]: metric(auc(run.games), n, "higher"),
    [`${prefix}.ece`]: metric(expectedCalibrationError(run.games), n, "lower"),
    [`${prefix}.slope`]: metric(calibrationSlope(run.games), n, "info"),
    [`${prefix}.pickEce`]: metric(expectedCalibrationError(run.picks), run.picks.length, "lower"),
    [`${prefix}.pickNearEven`]: metric(run.picks.length ? near / run.picks.length : NaN, run.picks.length, "info"),
    [`${prefix}.metaPrior`]: metric(run.metaPrior, n, "info"),
  };
}

/** The personal term on users' own games, from each player's earlier win rate: with it and without it. */
export interface PersonalRun {
  on: Prediction[];
  off: Prediction[];
}

export function personalRun(histories: UserMatch[][], index: MetaIndex, band: RankBandId, engine: EngineConfig): PersonalRun {
  const games = personalGames(histories, index, band, engine);
  return { on: personalPredictions(games, 1), off: personalPredictions(games, 0) };
}

export function personalMetrics(run: PersonalRun): Metrics {
  const n = run.on.length;
  return {
    "personal.gainVsOff": metric(score(run.on).logLoss - score(run.off).logLoss, n, "lower", pairedLogLossInterval(run.on, run.off)),
    "personal.logLoss": metric(score(run.on).logLoss, n, "lower"),
    "personal.ece": metric(expectedCalibrationError(run.on, 5), n, "lower"),
  };
}

const runeKey = (p: { primaryStyle: number; subStyle: number; runes: number[]; statPerks: number[] }) =>
  `${p.primaryStyle}|${p.subStyle}|${p.runes.join(",")}|${p.statPerks.join(",")}`;
const spellKey = (s: number[]) => s.filter((x) => x > 0).sort((a, b) => a - b).join(",");

/**
 * Rune pages and summoner spells on held-out games: for each player whose champion-role has a
 * solid build (config solidGames), whether they took what the loadout suggests, and how those
 * players did against everyone on the same champion-role in the test games ("delivered", in win
 * points), next to what the build's own win rates promised.
 */
export function loadoutMetrics(builds: ReadonlyMap<string, ChampionBuild>, test: MatchSummary[], cfg: LoadoutConfig): Metrics {
  type Acc = { players: number; matched: number; delivered: number; variance: number; promised: number };
  const acc: Record<"page" | "spells", Acc> = {
    page: { players: 0, matched: 0, delivered: 0, variance: 0, promised: 0 },
    spells: { players: 0, matched: 0, delivered: 0, variance: 0, promised: 0 },
  };
  // Test win rate of each champion-role (the bar a suggestion has to clear).
  const byKey = new Map<string, { games: number; wins: number }>();
  for (const m of test) for (const p of m.participants) {
    const k = `${p.championId}|${p.position}`;
    const r = byKey.get(k) ?? { games: 0, wins: 0 };
    r.games++;
    if (p.win) r.wins++;
    byKey.set(k, r);
  }
  for (const m of test) for (const p of m.participants) {
    const k = `${p.championId}|${p.position}`;
    const build = builds.get(k);
    if (!build || build.n < cfg.solidGames) continue;
    const base = build.games > 0 ? build.wins / build.games : 0.5;
    const r = byKey.get(k)!;
    const bar = r.wins / r.games;
    const smoothed = (o: { games: number; wins: number }) => (o.wins + cfg.priorGames * base) / (o.games + cfg.priorGames);
    const check = (kind: "page" | "spells", suggested: { games: number; wins: number } | null, matches: boolean) => {
      if (!suggested) return;
      const a = acc[kind];
      a.players++;
      if (!matches) return;
      a.matched++;
      a.delivered += (p.win ? 1 : 0) - bar;
      a.variance += bar * (1 - bar);
      a.promised += smoothed(suggested) - base;
    };
    if (p.perks?.runes.length) {
      const page = chooseOption(build.pages, build, cfg);
      check("page", page, page !== null && runeKey(page) === runeKey(p.perks));
    }
    if (p.spells.filter((x) => x > 0).length === 2) {
      const spells = chooseOption(build.spells, build, cfg);
      check("spells", spells, spells !== null && spellKey(spells.spells) === spellKey(p.spells));
    }
  }
  const out: Metrics = {};
  for (const kind of ["page", "spells"] as const) {
    const a = acc[kind];
    const delivered = a.matched ? a.delivered / a.matched : NaN;
    const half = a.matched ? (1.96 * Math.sqrt(a.variance)) / a.matched : NaN;
    out[`loadout.${kind}.taken`] = metric(a.players ? a.matched / a.players : NaN, a.players, "higher");
    out[`loadout.${kind}.delivered`] = metric(delivered, a.matched, "higher", [delivered - half, delivered + half]);
    out[`loadout.${kind}.promised`] = metric(a.matched ? a.promised / a.matched : NaN, a.matched, "info");
  }
  return out;
}

/** Candidate minus baseline on the same predictions (paired): log-loss change with its 95% interval. */
export function pairedChange(candidate: Prediction[], baseline: Prediction[]): Metric {
  return metric(score(candidate).logLoss - score(baseline).logLoss, candidate.length, "lower", pairedLogLossInterval(candidate, baseline));
}

/** A change is real when its interval leaves 0 on one side. */
export function verdict(m: Metric): "better" | "worse" | "same" {
  if (m.lo === undefined || m.hi === undefined || m.better === "info") return "same";
  const good = m.better === "lower" ? m.hi < 0 : m.lo > 0;
  const bad = m.better === "lower" ? m.lo > 0 : m.hi < 0;
  return good ? "better" : bad ? "worse" : "same";
}
