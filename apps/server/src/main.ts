/**
 * Server entry point (Railway runs `node dist/main.js`). Reads the environment,
 * opens the database and starts the HTTP API.
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { openDb } from "./db";
import { readServerEnv } from "./env";

const VERSION = "0.3.0-dev";

const env = readServerEnv(process.env);
const db = openDb(env.DATABASE_PATH);
const app = createApp({ db, version: VERSION });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`LoL Draft Coach server ${VERSION} listening on :${info.port}`);
  if (!env.RIOT_API_KEY) console.warn("RIOT_API_KEY is not set: registration and syncing will fail until it is.");
});

const shutdown = () => {
  server.close();
  db.$client.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
