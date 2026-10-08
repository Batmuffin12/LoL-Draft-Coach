/**
 * Checks engine v2's predictions against real collected games:
 *   pnpm --filter @ldc/server backtest                 (band 2, newest 25% held out)
 *   pnpm --filter @ldc/server backtest --band 2 --test 0.3
 * Builds a snapshot from the older games, predicts each held-out player's result from the
 * full draft (no personal data: collected players are anonymous), and reports accuracy,
 * calibration, which terms help, and which smoothing priors fit best. Then the same at the draft
 * level (one prediction per game: train / validation / test by time, baselines, term weights
 * fitted on validation and checked on test, paired intervals). Then the item ranking: builds from
 * the band and the band above, replayed on held-out timelines.
 *   --valid 0.2   share of games (before the test share) used to choose weights and priors
 */
import { dirname, join } from "node:path";
import { DataDragon } from "@ldc/ddragon";
import { completedItems, MetaIndex } from "@ldc/engine";
import {
  backtestItems,
  calibration,
  DRAFT_TERMS,
  draftGames,
  ENGINE_AS_IS,
  expectedCalibrationError,
  fitDraftModel,
  indexAsOf,
  logLossGainInterval,
  only,
  onlyTerms,
  pairedLogLossInterval,
  predict,
  predictDrafts,
  prepareBacktest,
  score,
  sideOnly,
  splitByTime,
  type DraftModel,
  type Prediction,
  type Scores,
} from "@ldc/meta";
import type { MatchSummary, TermName } from "@ldc/shared";
import { findConfigDir, loadServerConfig } from "./config";
import { openDb } from "./db";
import { readServerEnv } from "./env";
import { buildBandsFor, playstyleMetrics } from "./meta-job";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const band = flag("--band", 2);
const testShare = flag("--test", 0.25);
const validShare = flag("--valid", 0.2);

const env = readServerEnv(process.env);
const config = loadServerConfig(findConfigDir(process.cwd()));
const db = openDb(env.DATABASE_PATH);
const rows = db.$client.prepare("SELECT summary FROM matches WHERE band = ?").all(band) as { summary: string }[];
const bandsForBuilds = [band, ...buildBandsFor([band], config.bands)];
const buildRows = db.$client
  .prepare(`SELECT summary FROM matches WHERE band IN (${bandsForBuilds.map(() => "?").join(",")}) AND json_extract(summary, '$.timeline') IS NOT NULL`)
  .all(...bandsForBuilds) as { summary: string }[];
db.$client.close();
const matches = rows.map((r) => JSON.parse(r.summary) as MatchSummary);

const bt = prepareBacktest({ band, matches, testShare, aggregation: config.meta.aggregation, engine: config.engine, metrics: playstyleMetrics(config.engine) });
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");
const fmt = (s: Scores, preds?: Prediction[]) => {
  const ci = preds ? logLossGainInterval(preds) : null;
  return (
    `log-loss ${s.logLoss.toFixed(4)}  Brier ${s.brier.toFixed(4)}  right ${pct(s.accuracy)} of ${s.decided} leaning` +
    (ci ? `  vs coin flip [${ci[0] >= 0 ? "+" : ""}${ci[0].toFixed(4)}, ${ci[1] >= 0 ? "+" : ""}${ci[1].toFixed(4)}]` : "")
  );
};
const preds = (engine = bt.engine, index = bt.index) => predict(index, bt.testMatches, band, engine);
const run = (engine = bt.engine, index = bt.index) => score(preds(engine, index));

console.log(`Band ${band}: ${matches.length} collected games → train ${bt.train}, test ${bt.test} (newest ${Math.round(testShare * 100)}%).`);
console.log(`Coin flip:          log-loss ${Math.log(2).toFixed(4)}  Brier 0.2500`);
const all = predict(bt.index, bt.testMatches, band, bt.engine);
const allScores = score(all);
console.log(`Engine v2 (${allScores.n} picks): ${fmt(allScores, all)}`);

console.log("\nCalibration (predicted → actual):");
for (const b of calibration(all, 0.025).filter((x) => x.n >= 10)) {
  console.log(`  ${(b.from * 100).toFixed(1)}–${(b.to * 100).toFixed(1)}%  n=${String(b.n).padStart(4)}  predicted ${(b.meanPredicted * 100).toFixed(1)}%  won ${(b.actualWinRate * 100).toFixed(1)}%`);
}

console.log("\nTerms (each set alone). [interval] = 95% range of log-loss minus a coin flip's, resampling games; entirely below 0 = a real gain:");
const sets: TermName[][] = [["meta"], ["lane"], ["counter"], ["synergy"], ["team"], ["meta", "lane"], ["meta", "lane", "counter", "synergy"], ["meta", "lane", "counter", "synergy", "team"]];
for (const keep of sets) {
  const p = preds(onlyTerms(bt.engine, keep));
  console.log(`  ${keep.join(" + ").padEnd(40)} ${fmt(score(p), p)}`);
}

console.log("\nTeam-needs strength (teamRatingScale; the one hand-set term):");
for (const scale of [0, 10, 20, 40, 80]) {
  const engine = { ...bt.engine, rating: { ...bt.engine.rating, teamRatingScale: scale } };
  const p = preds(engine);
  console.log(`  ${String(scale).padStart(3)}${scale === config.engine.rating.teamRatingScale ? " (current)" : "          "}  ${fmt(score(p), p)}`);
}

console.log("\nSmoothing priors (prior games: meta / pair):");
let best: { meta: number; pair: number; s: Scores } | null = null;
for (const meta of [50, 150, 400, 1000]) {
  for (const pair of [20, 60, 150, 400]) {
    const rating = { ...bt.engine.rating, priorGames: { meta, pair } };
    const s = run({ ...bt.engine, rating }, new MetaIndex(bt.index.snapshot, rating));
    if (!best || s.logLoss < best.s.logLoss) best = { meta, pair, s };
    console.log(`  ${String(meta).padStart(5)} / ${String(pair).padStart(4)}   ${fmt(s)}`);
  }
}
const current = config.engine.rating.priorGames;
console.log(`\nBest: ${best!.meta} / ${best!.pair} (current config: ${current.meta} / ${current.pair}).`);

// Draft level: one prediction per game (independent samples). Weights and priors are chosen on
// the validation games (snapshot from train), then judged once on the test games (snapshot from
// train + validation): the honest way to decide whether a tuning is needed.
{
  const metrics = playstyleMetrics(config.engine);
  const split = splitByTime(matches, validShare, testShare);
  const validGames = draftGames(indexAsOf(split.train, band, config.meta.aggregation, config.engine, metrics), split.valid, band, config.engine);
  const testGames = draftGames(indexAsOf([...split.train, ...split.valid], band, config.meta.aggregation, config.engine, metrics), split.test, band, config.engine);
  const side = sideOnly([...draftGames(indexAsOf(split.train, band, config.meta.aggregation, config.engine, metrics), split.train.slice(-2000), band, config.engine)]);
  const ivl = (a: Prediction[], b: Prediction[]) => {
    const [lo, hi] = pairedLogLossInterval(a, b);
    return `[${lo >= 0 ? "+" : ""}${lo.toFixed(4)}, ${hi >= 0 ? "+" : ""}${hi.toFixed(4)}]`;
  };
  const line = (name: string, model: DraftModel, vs?: Prediction[]) => {
    const p = predictDrafts(testGames, model);
    const s = score(p);
    return {
      p,
      text: `  ${name.padEnd(34)} log-loss ${s.logLoss.toFixed(4)}  Brier ${s.brier.toFixed(4)}  right ${pct(s.accuracy)}  ECE ${pct(expectedCalibrationError(p))}${vs ? `  vs side only ${ivl(p, vs)}` : ""}`,
    };
  };
  console.log(`
Draft level (one prediction per game): train ${split.train.length}, validation ${validGames.length}, test ${testGames.length}.`);
  console.log("[interval] = 95% range of log-loss(model) − log-loss(side only) on the same games; entirely below 0 = a real gain.");
  const sideLine = line("Side only (blue's win rate)", side);
  console.log(sideLine.text);
  console.log(line("Meta only", { ...only(ENGINE_AS_IS, ["meta"]), intercept: side.intercept }, sideLine.p).text);
  console.log(line("Engine as is", { ...ENGINE_AS_IS, intercept: side.intercept }, sideLine.p).text);
  for (const t of DRAFT_TERMS) {
    console.log(line(`  without ${t}`, { ...only(ENGINE_AS_IS, DRAFT_TERMS.filter((x) => x !== t)), intercept: side.intercept }, sideLine.p).text);
  }
  const fitted = fitDraftModel(validGames);
  const fittedLine = line("Weights fitted on validation", fitted, sideLine.p);
  console.log(fittedLine.text);
  const asIs = predictDrafts(testGames, { ...ENGINE_AS_IS, intercept: side.intercept });
  console.log(`  fitted vs engine as is: ${ivl(fittedLine.p, asIs)}`);
  console.log(`  fitted weights: ${DRAFT_TERMS.map((t) => `${t} ${fitted.weights[t].toFixed(2)}`).join(", ")}; blue side ${fitted.intercept >= 0 ? "+" : ""}${fitted.intercept.toFixed(1)} points`);
  console.log("  (a weight near 0 means the term adds nothing; near 1, it is right as designed; a negative weight hurts.)");
}

// Items: rank each held-out purchase's slot from builds learned on older games.
const withTimelines = buildRows.map((r) => JSON.parse(r.summary) as MatchSummary).sort((a, b) => a.endedAt - b.endedAt);
const cut = Math.floor(withTimelines.length * (1 - testShare));
// As of the split, like the pick backtest (recency weights must not see the test games' time).
const cutTime = cut > 0 ? withTimelines[cut - 1]!.endedAt + 1 : 0;
const ddragon = new DataDragon({ cacheDir: join(dirname(env.DATABASE_PATH), "ddragon") });
await ddragon.load();
const completed = completedItems(ddragon.data.itemInfo, config.engine.loadout.items);
const itemRun = (loadout = config.engine.loadout, meta = config.meta) =>
  backtestItems({ train: withTimelines.slice(0, cut), test: withTimelines.slice(cut), now: cutTime, meta, loadout, completed });
const items = itemRun();
const wa = (x: { n: number; winAdded: number }) => `${Number.isFinite(x.winAdded) ? (x.winAdded >= 0 ? "+" : "") + (x.winAdded * 100).toFixed(1) : "—"} pts (${x.n})`;
console.log(`
Items (bands ${bandsForBuilds.join("+")}): ${withTimelines.length} games with timelines → train ${cut}, test ${withTimelines.length - cut}; ${items.purchases} held-out purchases ranked.`);
console.log(`  Ours:         top-1 ${pct(items.ranked.top1)}  top-3 ${pct(items.ranked.top3)}`);
console.log(`  Most bought:  top-1 ${pct(items.popular.top1)}  top-3 ${pct(items.popular.top3)}`);
console.log(`  Win added when the purchase was our #1: ${wa(items.agree)}; otherwise: ${wa(items.disagree)}`);

console.log("\n  Sweep: shareScale (popularity prior) × winAddedPriorGames (shrinking win added):");
for (const shareScale of [0, 20, 50, 100, 200]) {
  for (const prior of [30, 100, 300]) {
    const r = itemRun({ ...config.engine.loadout, shareScale }, { ...config.meta, builds: { ...config.meta.builds, winAddedPriorGames: prior } });
    const cur = shareScale === config.engine.loadout.shareScale && prior === config.meta.builds.winAddedPriorGames ? " (current)" : "";
    console.log(`    ${String(shareScale).padStart(3)} × ${String(prior).padStart(3)}  top-1 ${pct(r.ranked.top1)}  top-3 ${pct(r.ranked.top3)}  agree ${wa(r.agree)}  other ${wa(r.disagree)}${cur}`);
  }
}
