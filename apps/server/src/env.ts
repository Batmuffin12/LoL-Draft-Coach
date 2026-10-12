import { z } from "zod";

/** Riot routing values are short lower-case identifiers such as "euw1" or "europe". */
const routing = z.string().regex(/^[a-z0-9]+$/, 'must be a Riot routing value like "euw1" or "europe"');
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v);

const ServerEnvSchema = z.object({
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(8787)),
  /** SQLite file; on Railway this sits on the mounted volume. */
  DATABASE_PATH: z.preprocess(blankToUndefined, z.string().default("data/ldc.sqlite")),
  /** The one Riot API key. Lives only on the server. */
  RIOT_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  RIOT_KEY_TYPE: z.preprocess(blankToUndefined, z.enum(["development", "personal", "production"]).default("development")),
  RIOT_PLATFORM: z.preprocess(blankToUndefined, routing.default("euw1")),
  RIOT_REGION: z.preprocess(blankToUndefined, routing.default("europe")),
  /**
   * Minutes between background sync passes over recently active users; 0 turns the
   * loop off (the server can then sleep when unused; profiles still refresh on request).
   */
  SYNC_INTERVAL_MINUTES: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1440).default(5)),
  /** A user's games are refreshed when older than this many minutes. */
  SYNC_STALE_MINUTES: z.preprocess(blankToUndefined, z.coerce.number().min(1).max(10080).default(30)),
  /** Owner-only token for POST /admin/invites; the route doesn't exist when unset. */
  ADMIN_TOKEN: z.preprocess(blankToUndefined, z.string().min(32, "must be at least 32 characters").optional()),
  /** Daily backup of the user data to an S3-compatible bucket (Cloudflare R2). Off unless all five are set. */
  BACKUP_S3_ENDPOINT: z.preprocess(blankToUndefined, z.url({ protocol: /^https?$/ }).optional()),
  BACKUP_S3_BUCKET: z.preprocess(blankToUndefined, z.string().optional()),
  BACKUP_S3_ACCESS_KEY_ID: z.preprocess(blankToUndefined, z.string().optional()),
  BACKUP_S3_SECRET_ACCESS_KEY: z.preprocess(blankToUndefined, z.string().optional()),
  /** 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep a copy outside Railway. */
  BACKUP_ENCRYPTION_KEY: z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 random bytes in base64")
      .optional(),
  ),
  BACKUP_EVERY_HOURS: z.preprocess(blankToUndefined, z.coerce.number().min(1).max(168).default(24)),
  BACKUP_KEEP_DAYS: z.preprocess(blankToUndefined, z.coerce.number().min(1).max(365).default(30)),
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export class ServerEnvError extends Error {}

const BACKUP_VARS = ["BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "BACKUP_ENCRYPTION_KEY"] as const;

export interface BackupSettings {
  s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  key: Buffer;
  everyMs: number;
  keepMs: number;
}

/** The backup settings, or null when backups are off (none set). Some but not all set is an error. */
export function backupSettings(env: ServerEnv): BackupSettings | null {
  const missing = BACKUP_VARS.filter((name) => !env[name]);
  if (missing.length === BACKUP_VARS.length) return null;
  if (missing.length) throw new ServerEnvError(`Backups are half configured: set ${missing.join(", ")} (or none of the BACKUP_ variables).`);
  return {
    s3: { endpoint: env.BACKUP_S3_ENDPOINT!, bucket: env.BACKUP_S3_BUCKET!, accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID!, secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY! },
    key: Buffer.from(env.BACKUP_ENCRYPTION_KEY!, "base64"),
    everyMs: env.BACKUP_EVERY_HOURS * 3_600_000,
    keepMs: env.BACKUP_KEEP_DAYS * 86_400_000,
  };
}

/** Reads and validates the server's environment; names exactly what to fix. */
export function readServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const r = ServerEnvSchema.safeParse(env);
  if (!r.success) throw new ServerEnvError(`Invalid server environment:\n${z.prettifyError(r.error)}`);
  return r.data;
}
