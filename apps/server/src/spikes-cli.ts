/**
 * Measures power spikes on the collected games of every band (docs/ENGINE-PLAN.md) and checks
 * whether they're real before the app shows them:
 *   pnpm --filter @ldc/server spikes              (DATABASE_PATH, e.g. a production copy)
 *   pnpm --filter @ldc/server spikes --z 2 --top 15
 * Prints how many games have timelines (and kill/level events), a split-half check (the same
 * spikes measured on two halves of the games), and the strongest and weakest spikes.
 */
import { dirname, join } from "node:path";
import { DataDragon } from "@ldc/ddragon";
import { completedItems } from "@ldc/engine";
import { SpikeMeasure, type SpikeOptions } from "@ldc/meta";
import type { MatchSummary } from "@ldc/shared";
import { findConfigDir, loadServerConfig } from "./config";
import { openDb } from "./db";
import { readServerEnv } from "./env";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const top = flag("--top", 15);

const env = readServerEnv(process.env);
const config = loadServerConfig(findConfigDir(process.cwd()));
const z = flag("--z", config.meta.spikes.checkZ);
const db = openDb(env.DATABASE_PATH);
const rows = db.$client.prepare("SELECT summary FROM matches WHERE source = 'collector' AND json_extract(summary, '$.timeline') IS NOT NULL").all() as { summary: string }[];
db.$client.close();
const matches = rows.map((r) => JSON.parse(r.summary) as MatchSummary);

const ddragon = new DataDragon({ cacheDir: join(dirname(env.DATABASE_PATH), "ddragon") });
await ddragon.load();
const name = (id: number) => ddragon.data.champions.get(id)?.name ?? `#${id}`;
const opts: SpikeOptions = {
  now: Date.now(),
  config: { ...config.meta.spikes, checkZ: z },
  minDurationSec: config.meta.aggregation.minDurationSec,
  windowDays: config.meta.aggregation.windowDays,
  completed: completedItems(ddragon.data.itemInfo, config.engine.loadout.items),
};

const withKills = matches.filter((m) => m.timeline?.kills).length;
const withLevels = matches.filter((m) => m.timeline?.levels).length;
console.log(`Collected games with timelines: ${matches.length} (kill events: ${withKills}, levels: ${withLevels}), all bands`);

const measure = new SpikeMeasure(opts);
for (const m of matches) measure.add(m);
const { spikes, check } = measure.finish();
console.log(
  `Split-half: ${check.pairs} champion-role events in both halves; gold-swing correlation ${check.goldCorrelation ?? "—"}; ` +
    `same direction for ${check.signAgreement === null ? "—" : `${(check.signAgreement * 100).toFixed(0)}%`} of ${check.strongPairs} spikes at |z| ≥ ${z}`,
);

const all = spikes.flatMap((c) => c.spikes.map((s) => ({ ...s, champion: name(c.championId), role: c.role })));
const label = (s: (typeof all)[number]) => (s.kind === "item" ? `item ${s.at}` : `level ${s.at}`);
const table = (xs: typeof all) =>
  console.table(
    xs.map((s) => ({
      champion: s.champion,
      role: s.role,
      at: label(s),
      games: s.n,
      minute: s.minute,
      gold: s.gold,
      goldZ: s.goldZ,
      fights: s.fights ?? "—",
      fightsZ: s.fightsZ ?? "—",
    })),
  );
const items = all.filter((s) => s.kind === "item").sort((a, b) => b.goldZ - a.goldZ);
console.log(`\nItem spikes measured: ${items.length} (${items.filter((s) => s.goldZ >= z).length} at z ≥ ${z}). Strongest:`);
table(items.slice(0, top));
console.log("Weakest (gains least after the item):");
table(items.slice(-Math.min(top, 8)).reverse());
const levels = all.filter((s) => s.kind === "level").sort((a, b) => b.goldZ - a.goldZ);
if (levels.length) {
  console.log(`\nLevel spikes measured: ${levels.length} (${levels.filter((s) => s.goldZ >= z).length} at z ≥ ${z}). Strongest:`);
  table(levels.slice(0, top));
}
