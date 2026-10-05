/**
 * Server entry point (Railway runs `node dist/main.js`). Reads the environment and
 * config, opens the database, starts the HTTP API and the background sync loop.
 */
import { serve } from "@hono/node-server";
import { RiotApi } from "@ldc/riot-api";
import { createApp } from "./app";
import { findConfigDir, loadServerConfig } from "./config";
import { openDb } from "./db";
import { readServerEnv } from "./env";
import { SyncScheduler } from "./sync-scheduler";

const VERSION = "0.4.3";
const MINUTE = 60_000;

const env = readServerEnv(process.env);
const config = loadServerConfig(findConfigDir(process.cwd()));
const db = openDb(env.DATABASE_PATH);
const riot = env.RIOT_API_KEY
  ? new RiotApi({ apiKey: env.RIOT_API_KEY, keyType: env.RIOT_KEY_TYPE, platform: env.RIOT_PLATFORM, region: env.RIOT_REGION })
  : null;
const sync = riot
  ? new SyncScheduler(db, riot, { history: config.app.history, bands: config.bands }, {
      tickMs: Math.max(1, env.SYNC_INTERVAL_MINUTES) * MINUTE,
      // Refresh a user's games when older than SYNC_STALE_MINUTES while they've used the app in the last 14 days.
      staleAfterMs: env.SYNC_STALE_MINUTES * MINUTE,
      activeWithinMs: 14 * 24 * 60 * MINUTE,
    })
  : null;
const app = createApp({
  db,
  version: VERSION,
  riot,
  riotKeyRejected: () => riot?.keyProblem != null,
  sync,
  syncWhenStaleMs: env.SYNC_STALE_MINUTES * MINUTE,
  adminToken: env.ADMIN_TOKEN ?? null,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`LoL Draft Coach server ${VERSION} listening on :${info.port}`);
  if (!riot) console.warn("RIOT_API_KEY is not set: registration and syncing are off until it is.");
  // With SYNC_INTERVAL_MINUTES=0 there is no timer: syncs run on request only, and the
  // server sends no outbound traffic while unused, so Railway can put it to sleep.
  if (env.SYNC_INTERVAL_MINUTES > 0) sync?.start();
});

const shutdown = () => {
  sync?.stop();
  server.close();
  db.$client.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
