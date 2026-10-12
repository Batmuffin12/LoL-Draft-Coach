/**
 * pnpm perf:screens <set>: a screenshot (440 × 720, zoom 1) and a view dump of every screen into
 * docs/perf/results/<set>/, from the simulator and a synthetic history (no real player). Builds the
 * panel first. Compare two sets with `pnpm perf:guard <a> <b>`.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const set = process.argv[2];
if (!set) {
  console.error("Usage: pnpm perf:screens <set>");
  process.exit(1);
}
const shell = process.platform === "win32";
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("pnpm", ["--filter", "@ldc/desktop", "build"], { LDC_PERF_PROFILING: "" });
run("npx", ["tsx", "scripts/perf/desktop.ts", "screens", join(root, "docs", "perf", "results", set)]);
