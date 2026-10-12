/**
 * pnpm perf [--label <name>] [--only desktop,clicks,server,bench,fallow,bundle] [--quick]
 * Measures the panel and the server locally (docs/perf/README.md) and writes
 * docs/perf/results/<label>.json: every metric with its median, p95 and spread.
 * Nothing here touches production or the Riot API.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const local = join(root, ".local", "perf");
mkdirSync(local, { recursive: true });
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const label = opt("label", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
const only = new Set((opt("only", "bundle,desktop,clicks,bench,server,fallow") ?? "").split(","));
const quick = args.includes("--quick");
const shell = process.platform === "win32";

const run = (cmd, cmdArgs, opts = {}) => {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", shell, ...opts, env: { ...process.env, ...opts.env } });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed (${r.status})`);
};
// tsx without a shell, so JSON arguments reach the script intact on Windows.
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const tsx = (script, scriptArgs, opts = {}) => run(process.execPath, [tsxCli, script, ...scriptArgs], { shell: false, ...opts });
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

// ---- statistics -------------------------------------------------------------------------------
const sorted = (xs) => [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
const quantile = (s, q) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] : null);
/** A timing metric from samples: median, p95, min, max, samples. */
function dist(samples, unit = "ms") {
  const s = sorted(samples);
  return { median: quantile(s, 0.5), p95: quantile(s, 0.95), min: s[0] ?? null, max: s.at(-1) ?? null, samples: s.length, unit };
}
const value = (v, unit) => ({ value: v, unit });

const metrics = {};
const raw = {};

// ---- bundle sizes ----------------------------------------------------------------------------
function buildDesktop(profiling) {
  run("pnpm", ["--filter", "@ldc/desktop", "build"], { env: profiling ? { LDC_PERF_PROFILING: "1" } : { LDC_PERF_PROFILING: "" } });
}
function bundle() {
  const dist = join(root, "apps", "desktop", "dist");
  const assets = join(dist, "renderer", "assets");
  const sum = (re) => readdirSync(assets).filter((f) => re.test(f)).reduce((n, f) => n + statSync(join(assets, f)).size, 0);
  metrics["bundle.rendererJs"] = value(sum(/\.js$/), "bytes");
  metrics["bundle.rendererCss"] = value(sum(/\.css$/), "bytes");
  metrics["bundle.fonts"] = value(sum(/\.(woff2?|ttf)$/), "bytes");
  metrics["bundle.main"] = value(statSync(join(dist, "main", "index.cjs")).size, "bytes");
  metrics["bundle.preload"] = value(statSync(join(dist, "preload", "index.cjs")).size, "bytes");
}

// ---- desktop ---------------------------------------------------------------------------------
function startup() {
  const out = join(local, "startup.json");
  tsx("scripts/perf/desktop.ts", ["startup", String(quick ? 3 : 10), out]);
  const runs = readJson(out);
  raw.startup = runs.map((r) => ({ marks: r.marks, renderer: r.renderer?.marks, emits: r.emits }));
  const since = (r, mark) => {
    const t = r.marks[mark] ?? r.renderer?.marks?.[mark];
    return t === undefined ? NaN : t - r.marks.spawn;
  };
  for (const m of ["ready", "windowCreated", "firstContentfulPaint", "firstState", "firstScreen", "fullScreen"]) metrics[`desktop.coldStart.${m}`] = dist(runs.map((r) => since(r, m)));
  metrics["desktop.coldStart.pushes"] = dist(runs.map((r) => r.pushes.length), "count");
  metrics["desktop.coldStart.profileLoad"] = dist(runs.map((r) => r.emits.filter((e) => e.source === "profiles:profile").reduce((n, e) => n + e.ms, 0)));
  metrics["desktop.coldStart.mainBusy"] = dist(runs.map((r) => r.emits.reduce((n, e) => n + e.ms, 0)));
}

/** Summarises one replay run's raw numbers into metrics under desktop.replay.<name>. */
function summariseReplay(name, r, clickKey) {
  const k = (m) => `desktop.replay.${name}.${m}`;
  const R = r.renderer ?? { updates: [], commits: [], longTasks: [], clicks: [], frames: [] };
  const draftEmits = r.emits.filter((e) => e.source === "lcu:champSelect");
  // Event → painted, per champ select event: from the event in main to the paint of the push carrying its result.
  const paintedBySeq = new Map(R.updates.map((u) => [u.seq, u]));
  const latency = [];
  for (const e of draftEmits) {
    const u = paintedBySeq.get(e.donePushSeq);
    if (u?.paintedAt) latency.push(u.paintedAt - e.at);
  }
  const span = Math.max(1, (r.pushes.at(-1)?.at ?? 0) - (r.pushes[0]?.at ?? 0)) / 60_000;
  metrics[k("update")] = dist(latency);
  metrics[k("build")] = dist(draftEmits.map((e) => e.ms));
  metrics[k("send")] = dist(r.pushes.map((p) => p.sendMs));
  metrics[k("bytes")] = dist(r.pushes.map((p) => p.bytes), "bytes");
  metrics[k("pushesPerMin")] = value(r.pushes.length / span, "per min");
  metrics[k("pushesPerDraftEvent")] = value(draftEmits.length ? draftEmits.reduce((n, e) => n + e.pushes, 0) / draftEmits.length : null, "count");
  metrics[k("identicalShare")] = value(r.pushes.length ? r.pushes.filter((p) => p.identical || p.sameButTime).length / r.pushes.length : null, "share");
  metrics[k("ipcLatency")] = dist(R.updates.filter((u) => u.sentAt).map((u) => u.receivedAt - u.sentAt));
  metrics[k("renderToPaint")] = dist(R.updates.filter((u) => u.paintedAt).map((u) => u.paintedAt - u.receivedAt));
  const commits = R.commits.map((c) => c.actualMs);
  metrics[k("commit")] = { ...dist(commits), total: commits.reduce((a, b) => a + b, 0) };
  metrics[k("commitsPerMin")] = value(commits.length / span, "per min");
  metrics[k("longTasks")] = value(R.longTasks.length, "count");
  metrics[k("longTaskMax")] = value(R.longTasks.reduce((m, t) => Math.max(m, t.ms), 0), "ms");
  metrics[k("frame")] = dist(R.frames);
  metrics[k("framesOver17")] = value(R.frames.length ? R.frames.filter((f) => f > 17).length / R.frames.length : null, "share");
  const heap = r.heap.map((h) => h.rendererUsed / 1e6);
  if (heap.length >= 2) {
    // From the second sample (after the first replay) to the last: growth between replays.
    metrics[k("heapGrowth")] = value(heap.at(-1) - heap[Math.min(1, heap.length - 1)], "MB");
    metrics[k("heap")] = value(heap.at(-1), "MB");
    metrics[k("mainHeap")] = value(r.heap.at(-1).mainUsed / 1e6, "MB");
  }
  for (const m of r.metrics ?? []) metrics[k(`workingSet.${m.type}`)] = value((metrics[k(`workingSet.${m.type}`)]?.value ?? 0) + m.workingSetKb / 1024, "MB");
  metrics[k("cpu.total")] = value((r.metrics ?? []).reduce((n, m) => n + m.cpu, 0), "%");
  if (clickKey) {
    const clicks = R.clicks.filter((c) => c.paintMs !== null);
    metrics[`desktop.clicks.${clickKey}`] = dist(clicks.map((c) => c.paintMs));
    metrics[`desktop.clicks.${clickKey}.eventTiming`] = dist(clicks.filter((c) => c.eventMs !== null).map((c) => c.eventMs));
  }
  raw[`replay.${name}`] = { pushes: r.pushes.length, emits: r.emits.length, sources: Object.fromEntries(Object.entries(Object.groupBy(r.emits, (e) => e.source)).map(([s, es]) => [s, { count: es.length, ms: dist(es.map((e) => e.ms)), pushes: es.reduce((n, e) => n + e.pushes, 0) }])) };
}

const REPLAYS = [
  { name: "mid-counter", seconds: 60, clicks: ["css:.alt"], rounds: 30, key: "ifNot" },
  { name: "locked-solid", seconds: 60, clicks: ["Runes", "Build", "Matchups"], rounds: 10, key: "lockedTab" },
  { name: "full-game", seconds: 60, clicks: ["Style", "Pool", "New", "This month", "Last game"], rounds: 7, key: "lobbyTab" },
  { name: "lobby", seconds: 10, clicks: ["Top", "Mid"], rounds: 15, key: "pill" },
];

function replays() {
  for (const rp of REPLAYS) {
    const out = join(local, `replay-${rp.name}.json`);
    tsx("scripts/perf/desktop.ts", ["replay", rp.name, String(quick ? Math.min(rp.seconds, 20) : rp.seconds), out, JSON.stringify(rp.clicks), String(rp.rounds)]);
    summariseReplay(rp.name, readJson(out), rp.key);
  }
}

// ---- benches, server, fallow ----------------------------------------------------------------
function benches() {
  const outs = [join(local, "bench-coach.json"), join(local, "bench-engine.json")];
  tsx("bench/coach.bench.ts", [outs[0]], { cwd: join(root, "apps", "desktop") });
  tsx("bench/engine-meta.bench.ts", [outs[1]], { cwd: join(root, "packages", "sim") });
  for (const b of outs.flatMap((f) => readJson(f))) metrics[`bench.${b.name}`] = { median: b.medianMs, p95: b.p95Ms, min: b.minMs, max: b.maxMs, samples: b.runs, unit: "ms" };
}

function server() {
  run("pnpm", ["--filter", "@ldc/server", "build"]);
  const out = join(local, "server.json");
  tsx("scripts/perf/server.ts", [out, ...(quick ? ["--quick"] : [])]);
  const s = readJson(out);
  metrics["server.coldStart"] = dist(s.coldStartMs);
  metrics["server.job.snapshot"] = value(s.db.snapshotMs, "ms");
  metrics["server.job.sync200"] = value(s.sync.ms, "ms");
  for (const e of s.endpoints) {
    metrics[`server.${e.name}.latency`] = { median: e.latency.p50, p975: e.latency.p975, p99: e.latency.p99, max: e.latency.max, samples: e.requests, unit: "ms" };
    metrics[`server.${e.name}.reqPerSec`] = value(e.reqPerSec, "req/s");
    metrics[`server.${e.name}.bytes`] = value(e.wireBytes, "bytes");
    metrics[`server.${e.name}.unexpected`] = value(e.unexpected, "count");
  }
  for (const which of ["first", "next"]) {
    const runs = (s.flows ?? []).map((f) => f[which]);
    if (!runs.length) continue;
    metrics[`server.flow.${which}.total`] = dist(runs.map((r) => r.totalMs));
    metrics[`server.flow.${which}.profile`] = dist(runs.map((r) => r.profileMs));
    metrics[`server.flow.${which}.requests`] = value(runs.at(-1).requests.length, "count");
    metrics[`server.flow.${which}.bytes`] = value(runs.at(-1).requests.reduce((n, r) => n + r.bytes, 0), "bytes");
  }
  raw.server = { queryPlans: s.queryPlans, endpoints: s.endpoints, flow: s.flows?.at(-1) };
}

function fallow() {
  const dir = join(local, "fallow");
  mkdirSync(dir, { recursive: true });
  const fallowRun = (sub, file) => {
    const r = spawnSync("npx", ["-y", "fallow@3.33.1", ...sub, "--format", "json"], { cwd: root, shell, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(dir, file), r.stdout);
    return JSON.parse(r.stdout);
  };
  const all = fallowRun([], "all.json");
  const dupes = fallowRun(["dupes"], "dupes.json");
  const health = fallowRun(["health"], "health.json");
  const s = all.check.summary;
  for (const key of ["total_issues", "unused_files", "unused_exports", "unused_types", "unused_class_members", "unused_dependencies", "unresolved_imports", "circular_dependencies"]) metrics[`fallow.${key}`] = value(s[key], "count");
  metrics["fallow.duplication"] = value(dupes.stats.duplication_percentage, "%");
  metrics["fallow.duplicatedLines"] = value(dupes.stats.duplicated_lines, "lines");
  metrics["fallow.health"] = value(health.health_score.score, "score");
  metrics["fallow.functionsAboveThreshold"] = value(health.summary.functions_above_threshold, "count");
  raw.fallow = { grade: health.health_score.grade, unusedExports: all.check.unused_exports.map((x) => `${x.path}:${x.export_name}`), unusedClassMembers: all.check.unused_class_members.map((x) => `${x.path}.${x.member_name}`) };
}

// ---- run ------------------------------------------------------------------------------------
const started = Date.now();
if (only.has("bundle") || only.has("desktop") || only.has("clicks")) {
  buildDesktop(false);
  bundle();
}
if (only.has("desktop")) startup();
if (only.has("clicks")) {
  // React's profiling build reports render commit times; the normal build is restored afterwards.
  buildDesktop(true);
  try {
    replays();
  } finally {
    buildDesktop(false);
  }
}
if (only.has("bench")) benches();
if (only.has("server")) server();
if (only.has("fallow")) fallow();

const electronPkg = readJson(join(root, "apps", "desktop", "node_modules", "electron", "package.json"));
const result = {
  label,
  at: new Date(started).toISOString(),
  durationSec: Math.round((Date.now() - started) / 1000),
  quick,
  machine: { cpu: cpus()[0]?.model, cores: cpus().length, memGb: Math.round(totalmem() / 1e9), platform: process.platform, node: process.version, electron: electronPkg.version },
  git: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  metrics,
  raw,
};
const outDir = join(root, "docs", "perf", "results");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${label}.json`);
// Merges with an earlier run of the same label (e.g. --only server after the rest).
const merged = existsSync(file) ? { ...readJson(file), ...result, metrics: { ...readJson(file).metrics, ...metrics }, raw: { ...readJson(file).raw, ...raw } } : result;
writeFileSync(file, JSON.stringify(merged, null, 1));
console.log(`Wrote ${file} (${Object.keys(metrics).length} metrics, ${result.durationSec} s)`);
