/**
 * Engine and meta hot paths for `pnpm perf` (tsx packages/sim/bench/engine-meta.bench.ts [out.json]):
 * scoring a draft with live meta (packages/engine) and aggregating a band (packages/meta), on
 * synthetic data from this package.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeChampSelect, unavailableChampions, type ChampSelectSession } from "@ldc/lcu";
import { adviseLivePicks, computeComfort, MetaIndex, parseEngineConfig, suggestBans, weightsForBand, type PlayerGame } from "@ldc/engine";
import { BandAggregator, parseMetaConfig } from "@ldc/meta";
import { history, loadScenario } from "../src/index";
import { measure, save } from "../../../scripts/perf/microbench";

const configDir = join(import.meta.dirname, "..", "..", "..", "config");
const engine = parseEngineConfig(JSON.parse(readFileSync(join(configDir, "engine.v1.json"), "utf8")));
const metaConfig = parseMetaConfig(JSON.parse(readFileSync(join(configDir, "meta.v1.json"), "utf8")));
const now = Date.now();

const scenario = await loadScenario("mid-counter");
const session = scenario.draft.frames.filter((f) => f.uri === "/lol-champ-select/v1/session").at(-1)!.data as ChampSelectSession;
const draft = sanitizeChampSelect(session);
const h = history({ now, games: 1000, days: 365 });
const games: PlayerGame[] = h.matches.map(({ match, me }) => {
  const p = match.participants[me]!;
  return { championId: p.championId, win: p.win, position: p.position, endedAt: match.endedAt };
});
const index = new MetaIndex(scenario.meta!, engine.rating);
const band = scenario.meta!.band;
const input = {
  draft,
  pickable: [],
  unavailable: unavailableChampions(draft),
  comfort: computeComfort(games, h.masteries, now, engine.comfort, "middle"),
  attributes: new Map(),
  intendedPositions: new Map(),
  role: "middle" as const,
  weights: weightsForBand(band, engine),
  config: engine,
  index,
  band,
  filled: false,
};

await measure("engine: index a meta snapshot (new MetaIndex)", () => new MetaIndex(scenario.meta!, engine.rating));
await measure("engine: comfort from 1,000 games (computeComfort)", () => computeComfort(games, h.masteries, now, engine.comfort, "middle"));
await measure("engine: score a draft with live meta (adviseLivePicks)", () => adviseLivePicks(input));
await measure("engine: suggest bans (suggestBans)", () => suggestBans(input));

// A band's worth of collected games (synthetic, within the aggregation window).
const collected = Array.from({ length: 10 }, (_, i) => history({ now, games: 1000, days: metaConfig.aggregation.windowDays, seed: 50 + i }).matches.map((m) => m.match)).flat();
const metrics = [...new Set([...Object.values(engine.playstyle.axes).flatMap((a) => a.metrics), ...(engine.growth.metrics ?? []), ...Object.values(engine.growth.roles ?? {}).flat()].map((m) => m.replace(/^-/, "")))];
await measure(
  "meta: aggregate a band of 10,000 games (BandAggregator)",
  () => {
    const agg = new BandAggregator({ band, now, config: metaConfig.aggregation, metrics, championMetrics: engine.growth.roles ?? {} });
    for (const m of collected) agg.add(m);
    agg.finish();
  },
  { runs: 10, warmup: 1 },
);
save();
