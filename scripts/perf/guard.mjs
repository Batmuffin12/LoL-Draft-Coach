/**
 * The regression guard: pnpm perf:guard <setA> <setB>
 * Compares two screen sets made by `pnpm perf:screens <set>` (docs/perf/results/<set>/): every
 * view dump must match apart from timestamps, every screenshot must look the same (pixel diff,
 * with a small tolerance) and every screen's scroll overflow must be 0. Up to NOISE_PIXELS differing
 * pixels count as the same: champion icons from the CDN are sometimes scaled a pixel differently. Writes <setB>/guard.json
 * and, for images that differ, a copy with the differences in magenta under <setB>/diff/.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const results = join(root, "docs", "perf", "results");
const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("Usage: pnpm perf:guard <setA> <setB>");
  process.exit(1);
}
const NOISE_PIXELS = 50;
const dirA = join(results, a);
const dirB = join(results, b);

/** Epoch-millisecond numbers (dates of games, snapshot ages, timers) differ between runs: blank them. Floats compare to 6 significant digits. */
function normalise(v) {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalise(x)]));
  if (typeof v === "number") return v > 1e12 ? "<time>" : Number.isInteger(v) ? v : Number(v.toPrecision(6));
  if (typeof v === "string") return v.replace(/\b\d{1,2}:\d{2}\b/g, "<clock>");
  return v;
}

function diffPaths(x, y, path = "$", out = []) {
  if (out.length > 20) return out;
  if (JSON.stringify(x) === JSON.stringify(y)) return out;
  if (x && y && typeof x === "object" && typeof y === "object") {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) diffPaths(x[k], y[k], `${path}.${k}`, out);
    return out;
  }
  out.push(`${path}: ${JSON.stringify(x)?.slice(0, 80)} → ${JSON.stringify(y)?.slice(0, 80)}`);
  return out;
}

const electron = join(root, "apps", "desktop", "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const imageOut = join(dirB, "image-diff.json");
spawnSync(electron, [join(root, "scripts", "perf", "image-diff.cjs"), dirA, dirB, imageOut, join(dirB, "diff")], { stdio: "inherit" });
const images = existsSync(imageOut) ? JSON.parse(readFileSync(imageOut, "utf8")) : {};
const overflowB = JSON.parse(readFileSync(join(dirB, "overflow.json"), "utf8"));
const overflowA = JSON.parse(readFileSync(join(dirA, "overflow.json"), "utf8"));

const screens = readdirSync(dirA).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
const report = {};
let ok = true;
for (const s of screens) {
  const ja = join(dirA, `${s}.json`);
  const jb = join(dirB, `${s}.json`);
  const dumpDiff = existsSync(jb) ? diffPaths(normalise(JSON.parse(readFileSync(ja, "utf8"))), normalise(JSON.parse(readFileSync(jb, "utf8")))) : ["missing"];
  const img = images[`${s}.png`] ?? { missing: true };
  const r = { overflowBefore: overflowA[s], overflowAfter: overflowB[s], dumpSame: dumpDiff.length === 0, dumpDiff, diffPixels: img.diffPixels ?? null, diffShare: img.share ?? null };
  report[s] = r;
  const pass = r.overflowAfter === 0 && r.dumpSame && r.diffPixels !== null && r.diffPixels <= NOISE_PIXELS;
  r.pass = pass;
  if (!pass) ok = false;
  console.log(`${pass ? "ok  " : "DIFF"} ${s.padEnd(18)} overflow ${r.overflowBefore} → ${r.overflowAfter}  dump ${r.dumpSame ? "same" : "differs"}  pixels ${r.diffPixels}${r.diffPixels && r.diffPixels <= NOISE_PIXELS ? " (icon noise)" : ""}`);
  for (const d of dumpDiff.slice(0, 8)) console.log(`       ${d}`);
}
writeFileSync(join(dirB, "guard.json"), JSON.stringify({ against: a, ok, screens: report }, null, 2));
console.log(ok ? "Regression guard: every screen matches." : "Regression guard: differences found (see above).");
process.exit(ok ? 0 : 1);
