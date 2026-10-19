/**
 * The engine scorecard: is the advice getting better or worse? (research/engine-eval)
 *   pnpm --filter @ldc/server scorecard                          the current config, every band with games
 *   pnpm --filter @ldc/server scorecard --label 2026-10-19       ...and save it to docs/engine/scorecards/<label>.json
 *   pnpm --filter @ldc/server scorecard --set rating.priorGames.meta=1000 --set loadout.pickBy=winRate
 *                                                                a candidate change, scored on the same games (paired)
 *   pnpm --filter @ldc/server scorecard --compare a b             two saved scorecards side by side
 * Other flags: --bands 1,2 --folds 3 --fold-games 4000 --skip personal,loadout,items,ingame
 *
 * Every number is judged on games newer than the data it was built from: the draft on the newest
 * folds (each predicted from a snapshot of the games before it), runes, spells and items on the
 * newest quarter, the personal term on each player's later games from their earlier ones, and
 * the in-game win chance (scoreboard only, milestone 10) on the newest quarter of timelines.
 * The rule for a candidate: ship it when a main number gets better (its interval leaves 0) and no
 * guardrail gets worse; otherwise keep the current config.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DataDragon } from "@ldc/ddragon";
import { completedItems, parseEngineConfig, type EngineConfig } from "@ldc/engine";
import {
  backtestItems,
  draftMetrics,
  draftRun,
  fitWinModel,
  indexAsOf,
  loadoutMetrics,
  pairedChange,
  personalMetrics,
  personalRun,
  trainBuilds,
  verdict,
  winModelPredictions,
  type Metric,
  type Metrics,
} from "@ldc/meta";
import type { MatchSummary, RankBandId, UserMatch } from "@ldc/shared";
import { findConfigDir, loadServerConfig } from "./config";
import { openDb } from "./db";
import { readServerEnv } from "./env";
import { auc, pairedLogLossInterval, score } from "@ldc/meta";
import { buildBandsFor, playstyleMetrics } from "./meta-job";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const all = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const root = findConfigDir(process.cwd()).replace(/[\\/]config$/, "");
const outDir = join(root, "docs", "engine", "scorecards");

interface Saved {
  label: string;
  createdAt: string;
  games: Record<string, number>;
  set: string[];
  metrics: Metrics;
}

const fmtNum = (key: string, v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return "—";
  if (/accuracy|taken|NearEven|ece|Ece|delivered|promised|top[13]|winAdded/.test(key)) return `${(v * 100).toFixed(2)}%`;
  return v.toFixed(4);
};
const fmt = (key: string, m: Metric | undefined) =>
  m ? `${fmtNum(key, m.value)}${m.lo !== undefined ? ` [${fmtNum(key, m.lo)}, ${fmtNum(key, m.hi)}]` : ""}` : "—";

/** Main numbers decide; guardrails must not get worse. */
const isMain = (key: string) => /^draft\.b\d\.(gainVsSide|change)$/.test(key) || /^personal\.(gainVsOff|change)$/.test(key) || /^loadout\.\w+\.delivered$/.test(key);

if (opt("--compare")) {
  const [a, b] = [opt("--compare")!, args[args.indexOf("--compare") + 2]];
  if (!b) throw new Error("Usage: scorecard --compare <labelA> <labelB>");
  const load = (l: string) => JSON.parse(readFileSync(l.endsWith(".json") ? l : join(outDir, `${l}.json`), "utf8")) as Saved;
  const [A, B] = [load(a), load(b)];
  console.log(`| Number | ${A.label} | ${B.label} |\n| --- | --- | --- |`);
  for (const key of [...new Set([...Object.keys(A.metrics), ...Object.keys(B.metrics)])].sort()) {
    console.log(`| ${key}${isMain(key) ? " (main)" : ""} | ${fmt(key, A.metrics[key])} | ${fmt(key, B.metrics[key])} |`);
  }
  console.log(`\nGames: ${JSON.stringify(A.games)} → ${JSON.stringify(B.games)}. Different games: compare the intervals, not just the numbers.`);
  process.exit(0);
}

const env = readServerEnv(process.env);
const config = loadServerConfig(findConfigDir(process.cwd()));
const sets = all("--set");
/** The config with `path=value` changes (value read as JSON when it parses, else as text), validated. */
function withChanges(base: EngineConfig, changes: string[]): EngineConfig {
  const raw = structuredClone(base) as unknown as Record<string, unknown>;
  for (const c of changes) {
    const eq = c.indexOf("=");
    const path = c.slice(0, eq).split(".");
    const text = c.slice(eq + 1);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
    let node = raw;
    for (const p of path.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>;
    node[path[path.length - 1]!] = value;
  }
  return parseEngineConfig(raw);
}
const candidate = sets.length ? withChanges(config.engine, sets) : null;
const skip = new Set((opt("--skip") ?? "").split(",").filter(Boolean));
const folds = Number(opt("--folds") ?? 3);
const foldGames = opt("--fold-games") ? Number(opt("--fold-games")) : undefined;
const metricsOf = playstyleMetrics(config.engine);

const db = openDb(env.DATABASE_PATH);
const bandsWithGames = (db.$client.prepare("SELECT band, COUNT(*) AS n FROM matches WHERE source = 'collector' GROUP BY band ORDER BY band").all() as { band: number; n: number }[]).filter((b) => b.n >= 1000);
const bands = opt("--bands") ? opt("--bands")!.split(",").map(Number) : bandsWithGames.map((b) => b.band);
const load = (sql: string, ...params: unknown[]) => (db.$client.prepare(sql).all(...params) as { summary: string }[]).map((r) => JSON.parse(r.summary) as MatchSummary);

const result: Metrics = {};
const ci = ([lo, hi]: [number, number]) => ({ lo, hi });
const changes: Metrics = {};
const games: Record<string, number> = {};
const show = (title: string, m: Metrics) => {
  console.log(`\n${title}`);
  for (const [k, v] of Object.entries(m)) console.log(`  ${k.padEnd(28)} ${fmt(k, v).padEnd(34)} n=${v.n}${isMain(k) ? "  (main)" : ""}`);
};

// Draft: per band.
for (const band of bands as RankBandId[]) {
  const matches = load("SELECT summary FROM matches WHERE band = ? AND source = 'collector'", band);
  games[`band${band}`] = matches.length;
  const run = draftRun(matches, band, config.meta.aggregation, config.engine, metricsOf, { folds, foldGames });
  const m = draftMetrics(run, `draft.b${band}`);
  let title = `Draft, band ${band}: ${matches.length} games; newest ${run.folds} × ${run.foldGames} predicted`;
  if (candidate) {
    const c = draftRun(matches, band, config.meta.aggregation, candidate, metricsOf, { folds, foldGames });
    Object.assign(m, draftMetrics(c, `draft.b${band}`));
    changes[`draft.b${band}.change`] = pairedChange(c.games, run.games);
    changes[`draft.b${band}.pickChange`] = pairedChange(c.picks, run.picks);
    title += " (candidate)";
  }
  Object.assign(result, m);
  show(title, m);
}

// Personal: users' own games (band 2's meta, as the app's most common band).
if (!skip.has("personal")) {
  const rows = db.$client
    .prepare("SELECT um.user_id AS user, um.participant_index AS me, m.summary AS summary FROM user_matches um JOIN matches m ON m.match_id = um.match_id ORDER BY um.ended_at")
    .all() as { user: number; me: number; summary: string }[];
  const byUser = new Map<number, UserMatch[]>();
  for (const r of rows) byUser.set(r.user, [...(byUser.get(r.user) ?? []), { match: JSON.parse(r.summary) as MatchSummary, me: r.me }]);
  const band = 2 as RankBandId;
  const meta = load("SELECT summary FROM matches WHERE band = ? AND source = 'collector'", band);
  const run = personalRun([...byUser.values()], indexAsOf(meta, band, config.meta.aggregation, config.engine, metricsOf), band, config.engine);
  const m = personalMetrics(run);
  if (candidate) {
    const c = personalRun([...byUser.values()], indexAsOf(meta, band, config.meta.aggregation, candidate, metricsOf), band, candidate);
    Object.assign(m, personalMetrics(c));
    changes["personal.change"] = pairedChange(c.on, run.on);
  }
  games.users = byUser.size;
  Object.assign(result, m);
  show(`Personal: ${byUser.size} players, ${run.on.length} games after each one's first 20${candidate ? " (candidate)" : ""}`, m);
}

// Runes, spells and items: band 2 and the band above (as the app builds them), newest quarter held out.
if (!skip.has("loadout") || !skip.has("items") || !skip.has("ingame")) {
  const buildBands = [2, ...buildBandsFor([2 as RankBandId], config.bands)];
  const matches = load(`SELECT summary FROM matches WHERE source = 'collector' AND band IN (${buildBands.map(() => "?").join(",")})`, ...buildBands).sort((a, b) => a.endedAt - b.endedAt);
  const cut = Math.floor(matches.length * 0.75);
  const train = matches.slice(0, cut);
  const test = matches.slice(cut);
  const now = train.length ? train[train.length - 1]!.endedAt + 1 : 0;
  const ddragon = new DataDragon({ cacheDir: join(dirname(env.DATABASE_PATH), "ddragon") });
  await ddragon.load();
  const completed = completedItems(ddragon.data.itemInfo, config.engine.loadout.items);
  games.builds = matches.length;
  if (!skip.has("loadout")) {
    const { byKey } = trainBuilds(train, now, config.meta, completed);
    const m = loadoutMetrics(byKey, test, (candidate ?? config.engine).loadout);
    Object.assign(result, m);
    show(`Rune pages and spells (bands ${buildBands.join("+")}): ${train.length} games to learn from, ${test.length} to check${candidate ? " (candidate)" : ""}`, m);
  }
  if (!skip.has("items")) {
    const timed = (list: MatchSummary[]) => list.filter((x) => x.timeline);
    const r = backtestItems({ train: timed(train), test: timed(test), now, meta: config.meta, loadout: (candidate ?? config.engine).loadout, completed });
    const m: Metrics = {
      "items.top1": { value: r.ranked.top1, n: r.purchases, better: "higher" },
      "items.top3": { value: r.ranked.top3, n: r.purchases, better: "higher" },
      "items.winAddedOurs": { value: r.agree.winAdded, n: r.agree.n, better: "higher" },
      "items.winAddedOther": { value: r.disagree.winAdded, n: r.disagree.n, better: "info" },
    };
    Object.assign(result, m);
    show(`Items: ${r.purchases} held-out purchases${candidate ? " (candidate)" : ""}`, m);
  }
  if (!skip.has("ingame")) {
    // Timelines with the scoreboard fields (levels, CS, kills, monsters: stored since 2026-10-08).
    const timed = matches.filter((x) => x.timeline?.levels && x.timeline.kills && x.timeline.cs && x.timeline.monsters);
    const tcut = Math.floor(timed.length * 0.75);
    const itemGold = (id: number) => ddragon.data.itemInfo.get(id)?.gold ?? 0;
    const minutes = config.meta.winModel.minutes;
    const model = fitWinModel(timed.slice(0, tcut), minutes, itemGold);
    const m: Metrics = {};
    for (const minute of minutes) {
      const { model: p, side } = winModelPredictions(model, timed.slice(tcut), minute, itemGold);
      if (!p.length) continue;
      const s = score(p);
      m[`ingame.m${minute}.gainVsSide`] = { value: s.logLoss - score(side).logLoss, n: p.length, better: "lower", ...ci(pairedLogLossInterval(p, side)) };
      m[`ingame.m${minute}.accuracy`] = { value: s.accuracy, n: s.decided, better: "higher" };
      m[`ingame.m${minute}.auc`] = { value: auc(p), n: p.length, better: "higher" };
    }
    Object.assign(result, m);
    show(`In-game win chance (scoreboard only): ${tcut} games to learn from, ${timed.length - tcut} to check`, m);
  }
}
db.$client.close();

if (candidate) {
  show(`Candidate (${sets.join(", ")}) minus current, on the same games (below 0 = better):`, changes);
  const better = Object.entries(changes).filter(([k, m]) => isMain(k) && verdict(m) === "better");
  const worse = Object.entries(changes).filter(([, m]) => verdict(m) === "worse");
  console.log(
    better.length && !worse.length
      ? `\nShip it: better on ${better.map(([k]) => k).join(", ")}, worse on nothing.`
      : worse.length
        ? `\nKeep the current config: worse on ${worse.map(([k]) => k).join(", ")}.`
        : "\nKeep the current config: no main number got better beyond noise.",
  );
  console.log("Runes, spells and items aren't paired: compare their numbers with a scorecard of the current config.");
}

const label = opt("--label");
if (label) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const saved: Saved = { label, createdAt: new Date().toISOString(), games, set: sets, metrics: { ...result, ...changes } };
  writeFileSync(join(outDir, `${label}.json`), JSON.stringify(saved, null, 1));
  console.log(`\nSaved docs/engine/scorecards/${label}.json`);
}
