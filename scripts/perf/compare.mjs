/**
 * pnpm perf:compare <a> <b> [--all]
 * Prints a markdown before → after table of two `pnpm perf` results (docs/perf/results/<label>.json),
 * with the change in %, and each budget (scripts/perf/budgets.json) as within / over before and after.
 * Changes under 5% (or inside the runs' spread) are marked as noise.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
if (!a || !b) {
  console.error("Usage: pnpm perf:compare <labelA> <labelB>");
  process.exit(1);
}
const load = (label) => JSON.parse(readFileSync(label.endsWith(".json") ? label : join(root, "docs", "perf", "results", `${label}.json`), "utf8"));
const budgets = JSON.parse(readFileSync(join(here, "budgets.json"), "utf8"));
const A = load(a);
const B = load(b);

/** The headline number of a metric: its median, or its value. */
const main = (m) => (m ? (m.median ?? m.value ?? null) : null);
const stat = (m, s) => (m ? (s === "value" ? (m.value ?? m.median) : (m[s] ?? null)) : null);
const fmt = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (unit === "bytes") return v >= 1e6 ? `${(v / 1e6).toFixed(2)} MB` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} kB` : `${Math.round(v)} B`;
  if (unit === "share") return `${(v * 100).toFixed(0)}%`;
  const n = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${n}${unit === "ms" ? " ms" : unit === "MB" ? " MB" : unit === "%" ? "%" : ""}`;
};
/** Higher is better for these. */
const higherBetter = (key) => /reqPerSec|fallow\.health/.test(key);

function change(key, ma, mb) {
  const x = main(ma);
  const y = main(mb);
  if (x === null || y === null) return { text: "–", tone: "" };
  if (x === 0 && y === 0) return { text: "0%", tone: "same" };
  const pct = x === 0 ? Infinity : ((y - x) / Math.abs(x)) * 100;
  const better = higherBetter(key) ? y > x : y < x;
  // Noise: under 5%, or the new median inside the old run's min..max spread.
  const spread = ma?.min !== undefined && ma?.max !== undefined && ma.min !== null && y >= ma.min && y <= ma.max && (ma.samples ?? 0) > 1;
  const noise = Math.abs(pct) < 5 || spread;
  return { text: `${pct === Infinity ? "+∞" : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`}${noise ? " (noise)" : ""}`, tone: noise ? "same" : better ? "better" : "worse" };
}

const keys = [...new Set([...Object.keys(A.metrics), ...Object.keys(B.metrics)])].sort();
const rows = [];
for (const key of keys) {
  const ma = A.metrics[key];
  const mb = B.metrics[key];
  const unit = (ma ?? mb).unit;
  const budget = budgets[key];
  const within = (m) => {
    if (!budget || !m) return "";
    const v = stat(m, budget.stat);
    return v === null ? "" : v <= budget.max ? "within" : "**over**";
  };
  const c = change(key, ma, mb);
  rows.push({
    key,
    cells: [
      key,
      fmt(main(ma), unit),
      fmt(main(mb), unit),
      c.text,
      (ma?.p95 ?? ma?.p99) !== undefined || (mb?.p95 ?? mb?.p99) !== undefined ? `${fmt(ma?.p95 ?? ma?.p99, unit)} → ${fmt(mb?.p95 ?? mb?.p99, unit)}` : "",
      budget ? `${budget.stat} ≤ ${budget.max}` : "",
      budget ? `${within(ma)} → ${within(mb)}` : "",
    ],
    tone: c.tone,
    budget: !!budget,
  });
}
const all = process.argv.includes("--all");
const shown = all ? rows : rows.filter((r) => r.budget || r.tone !== "same");
console.log(`### ${A.label} → ${B.label}\n`);
console.log(`Same machine: ${A.machine.cpu === B.machine.cpu ? "yes" : "no"} (${B.machine.cpu}, ${B.machine.cores} cores, Node ${B.machine.node}, Electron ${B.machine.electron}). Medians; p95 (p99 for server latency) in its own column.\n`);
console.log("| Metric | Before | After | Change | p95/p99 before → after | Budget | Budget before → after |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const r of shown) console.log(`| ${r.cells.join(" | ")} |`);
const count = (src) => Object.entries(budgets).filter(([k, bud]) => !k.startsWith("$") && src.metrics[k] && stat(src.metrics[k], bud.stat) !== null);
const met = (src) => count(src).filter(([k, bud]) => stat(src.metrics[k], bud.stat) <= bud.max).length;
console.log(`\nBudgets met: ${met(A)}/${count(A).length} → ${met(B)}/${count(B).length}. ${all ? "" : "Unchanged metrics without a budget are hidden (--all shows them)."}`);
