import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";

/** Finds the nearest .env walking up from `start` (the repo root in development). */
export function findEnvFile(start: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface AppEnv {
  lolInstallDir: string;
  riotApiKey: string | null;
  riotKeyType: "development" | "personal";
  riotId: string | null;
  riotPlatform: string;
  riotRegion: string;
  jevEnabled: boolean;
}

/** Loads .env into process.env (secrets stay in the main process) and reads app settings. */
export function loadEnv(start: string): AppEnv {
  const file = process.env.LDC_ENV_FILE ?? findEnvFile(start);
  if (file) config({ path: file, quiet: true });
  return readEnv(process.env);
}

export class EnvError extends Error {}

/** Riot routing values are short lower-case identifiers such as "euw1" or "europe". */
const ROUTING = /^[a-z0-9]+$/;

export function readEnv(env: NodeJS.ProcessEnv): AppEnv {
  const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  for (const name of ["RIOT_PLATFORM", "RIOT_REGION"] as const) {
    const v = blank(env[name]);
    if (v !== null && !ROUTING.test(v)) {
      throw new EnvError(`${name} in .env must be a Riot routing value like "euw1" or "europe" (got "${v.slice(0, 40)}")`);
    }
  }
  return {
    lolInstallDir: blank(env.LOL_INSTALL_DIR) ?? "C:\\Riot Games\\League of Legends",
    riotApiKey: blank(env.RIOT_API_KEY),
    riotKeyType: env.RIOT_KEY_TYPE?.trim() === "personal" ? "personal" : "development",
    riotId: blank(env.RIOT_ID),
    riotPlatform: blank(env.RIOT_PLATFORM) ?? "euw1",
    riotRegion: blank(env.RIOT_REGION) ?? "europe",
    jevEnabled: env.JEV_ENABLED?.trim() === "true",
  };
}
