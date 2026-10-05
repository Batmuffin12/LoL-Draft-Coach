/**
 * Runs one collector wake-up (collect, prune, aggregate, publish) against the local database:
 *   pnpm --filter @ldc/server collect                 (development, reads .env)
 *   pnpm --filter @ldc/server collect --seconds 120   (shorter time budget)
 * In production the hourly Railway cron calls POST /admin/collect instead.
 */
import { RiotApi } from "@ldc/riot-api";
import { findConfigDir, loadServerConfig } from "./config";
import { openDb } from "./db";
import { readServerEnv } from "./env";
import { MetaJob } from "./meta-job";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};
const seconds = flag("--seconds");
const maxMatches = flag("--matches");

const env = readServerEnv(process.env);
if (!env.RIOT_API_KEY) {
  console.error("RIOT_API_KEY is not set.");
  process.exit(1);
}
const config = loadServerConfig(findConfigDir(process.cwd()));
const collector = {
  ...config.meta.collector,
  ...(seconds ? { budgetSeconds: seconds } : {}),
  ...(maxMatches ? { maxMatchesPerRun: maxMatches } : {}),
};
const db = openDb(env.DATABASE_PATH);
const riot = new RiotApi({ apiKey: env.RIOT_API_KEY, keyType: env.RIOT_KEY_TYPE, platform: env.RIOT_PLATFORM, region: env.RIOT_REGION });
const job = new MetaJob(db, riot, { meta: { ...config.meta, collector }, bands: config.bands, engine: config.engine });
const r = await job.run();
db.$client.close();
console.log(JSON.stringify({ ...r, seconds: Math.round((r.finishedAt - r.startedAt) / 1000) }, null, 2));
