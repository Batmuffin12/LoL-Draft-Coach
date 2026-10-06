/**
 * Runs the mock League client on a simulated scenario, for trying the panel (or screenshots)
 * with any team. Usage: pnpm --filter @ldc/sim mock <scenario> [time-scale] [--loop]
 * Without a scenario it lists them. The last frame stays up (the scenario's stop point)
 * unless --loop replays it. The scenario's meta snapshot is written to a temp file for
 * LDC_META_FILE, so the panel coaches from it in a development build.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLcuServer } from "@ldc/lcu/testing";
import { listScenarios, loadScenario } from "./scenario";

const args = process.argv.slice(2);
const loop = args.includes("--loop");
const [name, scale] = args.filter((a) => !a.startsWith("--"));
if (!name) {
  console.log(`Scenarios: ${listScenarios().join(", ")}`);
  console.log("Usage: pnpm --filter @ldc/sim mock <scenario> [time-scale, default 0.15] [--loop]");
  process.exit(0);
}
const timeScale = Number(scale ?? "0.15");
const scenario = await loadScenario(name);

const server = new MockLcuServer(scenario.draft);
const creds = await server.start();
const env = [`$env:LDC_LCU_OVERRIDE="${creds.port}:${creds.password}"`];
if (scenario.meta) {
  const file = join(tmpdir(), `ldc-sim-${name}-meta.json`);
  writeFileSync(file, JSON.stringify(scenario.meta));
  env.push(`$env:LDC_META_FILE="${file}"`);
}
console.log(`Mock League client on scenario "${name}": ${scenario.description}`);
console.log(`Start the panel with:  ${env.join("; ")}; pnpm desktop`);

for (;;) {
  while (server.clientCount === 0) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 2_000));
  await server.playAll(timeScale);
  if (!loop) {
    console.log("Scenario finished; its last frame stays up. Ctrl+C to stop.");
    await new Promise(() => {});
  }
  console.log("Scenario finished; replaying in 5s.");
  await new Promise((r) => setTimeout(r, 5_000));
  server.reset();
  for (const [uri, body] of Object.entries(scenario.draft.snapshots)) server.push(uri, body);
}
