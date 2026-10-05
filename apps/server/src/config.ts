import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseAppConfig, parseEngineConfig, parseRankBandConfig, type AppConfig, type EngineConfig, type RankBandConfig } from "@ldc/engine";

export interface ServerConfig {
  app: AppConfig;
  engine: EngineConfig;
  bands: RankBandConfig;
}

/** The repo's config/ folder: LDC_CONFIG_DIR, or the nearest config/ walking up from `start`. */
export function findConfigDir(start: string): string {
  if (process.env.LDC_CONFIG_DIR) return process.env.LDC_CONFIG_DIR;
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "config", "engine.v1.json"))) return join(dir, "config");
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not find the config folder from ${start}; set LDC_CONFIG_DIR.`);
    dir = parent;
  }
}

/** Reads and validates the versioned config files the server uses. */
export function loadServerConfig(dir: string): ServerConfig {
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown;
  return {
    app: parseAppConfig(read("app.v1.json")),
    engine: parseEngineConfig(read("engine.v1.json")),
    bands: parseRankBandConfig(read("rank-bands.v1.json")),
  };
}
