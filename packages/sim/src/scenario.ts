import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Fixture } from "@ldc/lcu";
import type { MetaSnapshot } from "@ldc/shared";

/** A ready-made test situation: a simulated champ select and, optionally, the meta it runs on. */
export interface Scenario {
  description: string;
  draft: Fixture;
  meta?: MetaSnapshot;
}

export const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "scenarios");

/** Scenario names (files in packages/sim/scenarios without .ts). */
export function listScenarios(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
    .map((f) => f.slice(0, -3))
    .sort();
}

/** Loads a scenario by name; its module's default export is the Scenario. */
export async function loadScenario(name: string): Promise<Scenario> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid scenario name "${name}"`);
  const mod = (await import(pathToFileURL(join(SCENARIOS_DIR, `${name}.ts`)).href)) as { default: Scenario };
  return mod.default;
}
