import { z } from "zod";

/** Riot routing values are short lower-case identifiers such as "euw1" or "europe". */
const routing = z.string().regex(/^[a-z0-9]+$/, 'must be a Riot routing value like "euw1" or "europe"');
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v);

export const ServerEnvSchema = z.object({
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(8787)),
  /** SQLite file; on Railway this sits on the mounted volume. */
  DATABASE_PATH: z.preprocess(blankToUndefined, z.string().default("data/ldc.sqlite")),
  /** The one Riot API key. Lives only on the server. */
  RIOT_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  RIOT_KEY_TYPE: z.preprocess(blankToUndefined, z.enum(["development", "personal", "production"]).default("development")),
  RIOT_PLATFORM: z.preprocess(blankToUndefined, routing.default("euw1")),
  RIOT_REGION: z.preprocess(blankToUndefined, routing.default("europe")),
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export class ServerEnvError extends Error {}

/** Reads and validates the server's environment; names exactly what to fix. */
export function readServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const r = ServerEnvSchema.safeParse(env);
  if (!r.success) throw new ServerEnvError(`Invalid server environment:\n${z.prettifyError(r.error)}`);
  return r.data;
}
