import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  parseEngineConfig,
  parseRankBandConfig,
  type EngineConfig,
  type RankBandConfig,
} from "@ldc/engine";

export const AppConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  history: z.object({
    matchCount: z.number().int().positive().max(1000),
    queues: z.array(z.number().int()).min(1),
  }),
  supportedQueues: z.array(z.number().int()),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface LoadedConfig {
  app: AppConfig;
  engine: EngineConfig;
  bands: RankBandConfig;
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
  const app = AppConfigSchema.safeParse(read("app.v1.json"));
  if (!app.success) throw new Error(`Invalid app config:\n${z.prettifyError(app.error)}`);
  return { app: app.data, engine: parseEngineConfig(read("engine.v1.json")), bands: parseRankBandConfig(read("rank-bands.v1.json")) };
}
