/**
 * Server entry point (Railway runs `node dist/main.js`). Reads the environment and
 * config, opens the database, starts the HTTP API and the background sync loop.
 */
import { dirname, join } from "node:path";
import { serve } from "@hono/node-server";
import { DataDragon } from "@ldc/ddragon";
import { RateLimiter, RiotApi } from "@ldc/riot-api";
import { createApp } from "./app";
import { BackupJob } from "./backup";
import { S3BackupStore } from "./backup-store";
import { findConfigDir, loadServerConfig } from "./config";
import { openDb } from "./db";
import { backupSettings, readServerEnv } from "./env";
import { MetaJob } from "./meta-job";
import { SyncScheduler } from "./sync-scheduler";
import { SERVER_VERSION as VERSION } from "./version";

const MINUTE = 60_000;

const env = readServerEnv(process.env);
const config = loadServerConfig(findConfigDir(process.cwd()));
const db = openDb(env.DATABASE_PATH);
// The collector leaves part of each limit free, so a user's sync never waits behind it (a boosted run may use all of it).
const limiter = new RateLimiter({ collectorShare: config.meta.collector.rateLimitShare });
const riot = env.RIOT_API_KEY
  ? new RiotApi({
      apiKey: env.RIOT_API_KEY,
      keyType: env.RIOT_KEY_TYPE,
      platform: env.RIOT_PLATFORM,
      region: env.RIOT_REGION,
      limiter,
    })
  : null;
const sync = riot
  ? new SyncScheduler(db, riot, { history: config.app.history, bands: config.bands, earlyDeathsMinute: config.engine.earlyDeathsMinute }, {
      tickMs: Math.max(1, env.SYNC_INTERVAL_MINUTES) * MINUTE,
      // Refresh a user's games when older than SYNC_STALE_MINUTES while they've used the app in the last 14 days.
      staleAfterMs: env.SYNC_STALE_MINUTES * MINUTE,
      activeWithinMs: 14 * 24 * 60 * MINUTE,
    })
  : null;
// Collector + aggregator: started only by POST /admin/collect (hourly cron), never by a timer here.
// Data Dragon items (completed items for builds), cached next to the database; checked once per wake-up.
const ddragon = new DataDragon({ cacheDir: join(dirname(env.DATABASE_PATH), "ddragon") });
const items = async () => {
  await ddragon.load();
  return ddragon.data.itemInfo;
};
const meta = new MetaJob(db, riot, { meta: config.meta, bands: config.bands, engine: config.engine }, { items, collectorShare: (share) => limiter.setCollectorShare(share) });
// Daily off-site backup of the user data, inside the hourly wake-up (no timer of its own).
const backupConf = backupSettings(env);
const backup = backupConf ? new BackupJob(db, env.DATABASE_PATH, new S3BackupStore(backupConf.s3), backupConf) : null;
const app = createApp({
  db,
  version: VERSION,
  riot,
  riotKeyRejected: () => riot?.keyProblem != null,
  sync,
  syncWhenStaleMs: env.SYNC_STALE_MINUTES * MINUTE,
  adminToken: env.ADMIN_TOKEN ?? null,
  maxUsers: config.app.accounts?.maxUsers ?? null,
  meta,
  backup,
  collectorStaleAfterMs: config.meta.collector.staleAfterHours * 60 * MINUTE,
  publicConfig: { app: config.app, engine: config.engine, bands: config.bands, explain: config.explain },
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`LoL Draft Coach server ${VERSION} listening on :${info.port}`);
  if (!riot) console.warn("RIOT_API_KEY is not set: registration and syncing are off until it is.");
  if (!backup) console.warn("BACKUP_ variables are not set: the user data is not backed up.");
  // With SYNC_INTERVAL_MINUTES=0 there is no timer: syncs run on request only, and the
  // server sends no outbound traffic while unused, so Railway can put it to sleep.
  if (env.SYNC_INTERVAL_MINUTES > 0) sync?.start();
});

const shutdown = () => {
  sync?.stop();
  // A run cut short by a redeploy is marked as such (the next run would close it too).
  if (meta.running) meta.closeOpenRuns();
  server.close();
  db.$client.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
