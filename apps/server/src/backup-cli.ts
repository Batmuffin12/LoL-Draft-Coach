/**
 * The user-data backups in the bucket (reads the BACKUP_ variables from .env):
 *   pnpm --filter @ldc/server backup list                       the stored backups, newest last
 *   pnpm --filter @ldc/server backup restore [name] [--out f]   download one (default: the newest), decrypt,
 *                                                               check it, write a SQLite file (default data/restored.sqlite)
 *   pnpm --filter @ldc/server backup now                        back up the local DATABASE_PATH (testing only:
 *                                                               it uploads to the same bucket under local/)
 * Production backs up by itself once a day, inside the hourly wake-up. Restoring production: docs/CLOUD.md.
 */
import { BackupJob, restoreBackup } from "./backup";
import { S3BackupStore } from "./backup-store";
import { openDb } from "./db";
import { backupSettings, readServerEnv } from "./env";

const [command, ...rest] = process.argv.slice(2);
const outAt = rest.indexOf("--out");
const out = outAt >= 0 ? rest[outAt + 1] : "data/restored.sqlite";
const name = rest.find((a, i) => !a.startsWith("--") && i !== outAt + 1) ?? null;

const env = readServerEnv(process.env);
const conf = backupSettings(env);
if (!conf) {
  console.error("Backups aren't configured: set the BACKUP_ variables in .env (see .env.example).");
  process.exit(1);
}
const store = new S3BackupStore(conf.s3);
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

if (command === "list") {
  const all = (await store.list("")).sort((a, b) => a.key.localeCompare(b.key));
  for (const o of all) console.log(`${o.key}  ${kb(o.size)}  ${new Date(o.lastModified).toISOString()}`);
  console.log(all.length ? `${all.length} backups` : "No backups yet.");
} else if (command === "restore") {
  const r = await restoreBackup(store, conf.key, out!, name);
  console.log(`✓ Restored ${r.objectKey} to ${out}: ${r.users} users, integrity ok.`);
  console.log("  It holds Riot IDs and hashed tokens: delete it when you're done.");
} else if (command === "now") {
  const job = new BackupJob(openDb(env.DATABASE_PATH), env.DATABASE_PATH, store, { ...conf, prefix: "local/" });
  const r = await job.run();
  if (r.error) {
    console.error(`✗ ${r.error}`);
    process.exit(1);
  }
  console.log(`✓ ${r.objectKey}: ${r.users} users, ${kb(r.bytes ?? 0)}`);
} else {
  console.error("Usage: backup list | backup restore [name] [--out file] | backup now");
  process.exit(1);
}
