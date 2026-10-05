import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parseAppConfig,
  parseExplainConfig,
  parseEngineConfig,
  parseRankBandConfig,
  type AppConfig,
  type EngineConfig,
  type ExplainConfig,
  type RankBandConfig,
} from "@ldc/engine";

export { AppConfigSchema, type AppConfig } from "@ldc/engine";

export interface LoadedConfig {
  app: AppConfig;
  engine: EngineConfig;
  bands: RankBandConfig;
  explain: ExplainConfig;
}

/** Finds the config folder: LDC_CONFIG_DIR, next to the packaged app, or the repo's config/ in development. */
export function findConfigDir(start: string, resourcesPath?: string): string {
  if (process.env.LDC_CONFIG_DIR) return process.env.LDC_CONFIG_DIR;
  if (resourcesPath && existsSync(join(resourcesPath, "config", "engine.v1.json"))) return join(resourcesPath, "config");
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "config", "engine.v1.json"))) return join(dir, "config");
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not find the config folder from ${start}`);
    dir = parent;
  }
}

/** Reads and validates the versioned config files (read at runtime, so they can be tuned without a rebuild). */
export function loadConfig(dir: string): LoadedConfig {
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown;
  return {
    app: parseAppConfig(read("app.v1.json")),
    engine: parseEngineConfig(read("engine.v1.json")),
    bands: parseRankBandConfig(read("rank-bands.v1.json")),
    explain: parseExplainConfig(read("explain.v1.json")),
  };
}
