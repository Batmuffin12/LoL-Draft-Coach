// `pnpm coverage` runs each package's tests with coverage; this prints the result
// as one table: line and branch coverage per package, then the worst-covered files.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const dirs = ["packages/shared", "packages/ddragon", "packages/riot-api", "packages/engine", "packages/lcu", "packages/meta", "packages/sim", "apps/server", "apps/desktop"];
const worst = Number(process.argv[2] ?? 25);
const files = [];

console.log("package              lines   branches  functions");
for (const dir of dirs) {
  const path = join(root, dir, "coverage", "coverage-summary.json");
  if (!existsSync(path)) {
    console.log(`${dir.padEnd(18)} (no coverage data)`);
    continue;
  }
  const summary = JSON.parse(readFileSync(path, "utf8"));
  const { lines, branches, functions } = summary.total;
  const pct = (m) => `${m.pct.toFixed(1)}%`.padStart(7);
  console.log(`${dir.padEnd(18)} ${pct(lines)}  ${pct(branches)}   ${pct(functions)}`);
  for (const [file, s] of Object.entries(summary)) {
    if (file !== "total") files.push({ file: relative(root, file).replaceAll("\\", "/"), lines: s.lines, branches: s.branches });
  }
}

// Ranked by uncovered lines: a big untested file matters more than a tiny one.
const missed = (f) => f.lines.total - f.lines.covered;
files.sort((a, b) => missed(b) - missed(a));
console.log(`\nworst ${worst} files by uncovered lines`);
for (const f of files.slice(0, worst)) {
  console.log(`${String(missed(f)).padStart(5)} missed  ${f.lines.pct.toFixed(0).padStart(3)}% lines ${f.branches.pct.toFixed(0).padStart(3)}% branches  ${f.file}`);
}
