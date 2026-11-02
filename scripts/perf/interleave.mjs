/**
 * Cold starts of two builds of the panel, batch by batch, so a machine that gets busier hits both:
 *   node scripts/perf/interleave.mjs <distBefore> <distAfter> <ddragonDir> [batches=10] [perBatch=100] [delays=tail]
 * <distBefore>, <distAfter>: copies of apps/desktop/dist, each moved into place for its batches.
 * <ddragonDir>: a copy of a panel's Data Dragon cache for the local stub (scripts/perf/ddragon-stub.ts).
 * Every window goes through scripts/perf/desktop.ts, which refuses to open one during a game.
 * Prints p50, p95, p99 and the slowest per build and every batch that lost a launch; a run can be resumed
 * (.local/perf/interleave.jsonl keeps what it measured: delete it to start over).
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "apps", "desktop", "dist");
const local = join(root, ".local", "perf");
const log = join(local, "interleave.jsonl");
const [distBefore, distAfter, ddragonDir, batches = "10", perBatch = "100", delays = "tail"] = process.argv.slice(2);
if (!distBefore || !distAfter || !ddragonDir) {
  console.error("Usage: node scripts/perf/interleave.mjs <distBefore> <distAfter> <ddragonDir> [batches] [perBatch] [delays]");
  process.exit(1);
}
const builds = { before: resolve(distBefore), after: resolve(distAfter) };
const lost = [];
mkdirSync(local, { recursive: true });

/** What one cold start measured, in ms since the process was spawned. */
function times(run) {
  const since = (t) => (t === undefined ? null : t - run.marks.spawn);
  const firstEvent = (source) => since(run.emits.find((e) => e.source === source)?.at);
  const marks = run.renderer?.marks ?? {};
  return { client: firstEvent("lcu:gameflowPhase"), ddragon: firstEvent("ddragon:patch"), firstScreen: since(marks.firstScreen), fullScreen: since(marks.fullScreen) };
}

/** Runs one batch with this build in place; the build goes back to its folder whatever happens. */
function runBatch(build, batch) {
  const out = join(local, `interleave-${build}.json`);
  rmSync(out, { force: true });
  renameSync(builds[build], dist);
  try {
    const env = { ...process.env, LDC_PERF_DDRAGON_DIR: resolve(ddragonDir), LDC_PERF_DDRAGON_DELAYS: delays, LDC_PERF_DDRAGON_FIRST: String(batch * Number(perBatch)) };
    const tsx = join(root, "scripts", "perf", "node_modules", "tsx", "dist", "cli.mjs");
    const r = spawnSync(process.execPath, [tsx, "scripts/perf/desktop.ts", "startup", perBatch, out], { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) return (r.stderr || r.stdout || "").split("\n").find((l) => l.includes("Error:")) ?? `exit ${r.status}`;
  } finally {
    renameSync(dist, builds[build]);
  }
  for (const run of JSON.parse(readFileSync(out, "utf8"))) appendFileSync(log, `${JSON.stringify({ build, batch, ...times(run) })}\n`);
  return null;
}

const measured = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);

if (existsSync(dist)) throw new Error("Move apps/desktop/dist aside first: the builds are moved into its place");
for (let batch = 0; batch < Number(batches); batch++) {
  // The order flips each batch, so neither build always goes first.
  for (const build of batch % 2 === 0 ? ["before", "after"] : ["after", "before"]) {
    if (measured().some((m) => m.build === build && m.batch === batch)) continue;
    const problem = runBatch(build, batch);
    if (problem && /is running|Couldn't check/.test(problem)) throw new Error(problem);
    if (problem) lost.push(`${build} batch ${batch}: ${problem}`);
    console.log(new Date().toISOString(), build, "batch", batch, problem ? "LOST" : "done");
  }
}

const quantile = (s, q) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
const rows = measured();
for (const metric of ["client", "ddragon", "firstScreen", "fullScreen"]) {
  for (const build of ["before", "after"]) {
    const s = rows.filter((r) => r.build === build && r[metric] !== null).map((r) => r[metric]).sort((a, b) => a - b);
    if (s.length) console.log(metric.padEnd(12), build.padEnd(7), `N=${s.length}`, ...[0.5, 0.95, 0.99].map((q) => `p${q * 100}=${quantile(s, q).toFixed(0)}`), `max=${s.at(-1).toFixed(0)}`);
  }
}
for (const l of lost) console.log("LOST", l);
