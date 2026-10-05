/**
 * LoL Draft Coach on Railway, as code. This file is the source of truth for the cloud setup:
 * change it here, then `railway config plan` and `railway config apply` (see docs/CLOUD.md).
 *
 * Cost choices are explained next to each setting and tracked in docs/CLOUD.md.
 * Secrets (RIOT_API_KEY, ADMIN_TOKEN) are never in this file: preserve() keeps the values
 * already stored in Railway.
 */
import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

const REGION = "europe-west4-drams3a"; // Netherlands: closest to EUW players and Riot's "europe" routing.
const MB = 1024 * 1024;

export default defineRailway(() => {
  // SQLite lives here. Billed per GB actually used ($0.15/GB-month); a user's 200 games are ~8 MB.
  const data = volume("ldc-server-volume", {
    region: REGION,
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });

  const server = service("ldc-server", {
    source: github("Batmuffin12/LoL-Draft-Coach", { branch: "main", checkSuites: false }),
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm --filter @ldc/server build",
      // Only server-relevant changes redeploy (fewer builds and cold starts).
      watchPatterns: ["apps/server/**", "packages/**", "config/**", "pnpm-lock.yaml", ".railway/**"],
    },
    deploy: {
      // A capped V8 heap keeps memory (billed per GB-minute) small; the server idles around 60-90 MB.
      startCommand: "node --max-old-space-size=256 apps/server/dist/main.js",
      healthcheckPath: "/health",
      healthcheckTimeout: 60,
      // Restart on failure is Railway's default (stored as unset, so not declared here).
      restartPolicyMaxRetries: 5,
      // Serverless: sleep after ~5-10 min without outbound traffic; no compute is billed while asleep.
      // The first request after sleeping wakes it (the desktop app retries during the cold start).
      sleepApplication: true,
      // A volume can't be shared, so deploys can't overlap anyway; drain the old container quickly.
      overlapSeconds: 0,
      drainingSeconds: 10,
      // Hard ceilings so a bug can't scale the bill; usage, not the limit, is what's billed.
      limitOverride: { containers: { cpu: 1, memoryBytes: 512 * MB } },
    },
    replicas: { [REGION]: 1 },
    volumeMounts: { "/data": data },
    networking: { serviceDomains: { "ldc-server-production-c9e7.up.railway.app": { port: 8080 } } },
    env: {
      DATABASE_PATH: "/data/ldc.sqlite",
      RIOT_PLATFORM: "euw1",
      RIOT_REGION: "europe",
      // No background timer: syncs run when a user opens the app (stale after 30 min) or ends a
      // game. Nothing runs while nobody uses it, so the service can sleep.
      SYNC_INTERVAL_MINUTES: "0",
      SYNC_STALE_MINUTES: "30",
      RIOT_KEY_TYPE: preserve(), // "development" now; "personal" once the personal key arrives
      RIOT_API_KEY: preserve(),
      ADMIN_TOKEN: preserve(),
    },
  });

  return project("lol-draft-coach", {
    resources: [server, data],
  });
});
