/**
 * Test the current branch against a local coach server instead of production:
 *   pnpm local:server    the server on http://localhost:8788 with apps/server/data/ldc.sqlite
 *   pnpm local:desktop   the panel in server mode against it, with its own profile in .local/desktop-profile
 * Run each in its own terminal. Both read the repo's .env and add the local settings on top
 * (.env < local settings < LDC_LOCAL_* overrides); nothing in .env or your normal app profile changes.
 * First time: register the panel with an invite from `pnpm --filter @ldc/server invite "local"`.
 * More meta data: `pnpm --filter @ldc/server collect --seconds 900` (then restart the server).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const dotenv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const PORT = process.env.LDC_LOCAL_PORT ?? "8788";
const mode = process.argv[2];

/** Secrets are only reported as set or missing. */
const show = (env, names, secrets = []) => {
  for (const n of names) console.log(`  ${n.padEnd(22)} ${env[n] ? env[n] : "(not set)"}`);
  for (const n of secrets) console.log(`  ${n.padEnd(22)} ${env[n] ? "set" : "MISSING"}`);
};

const run = (cmd, cwd, env) => {
  const child = spawn(cmd, { cwd, env, stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 0));
};

if (!existsSync(envFile)) console.warn(`No .env at ${envFile}: only the local settings are used.`);

/** True when something already listens on the port (e.g. a local server from an earlier terminal). */
const portTaken = (port) =>
  new Promise((resolve) => {
    const s = createServer()
      .once("error", () => resolve(true))
      .once("listening", () => s.close(() => resolve(false)))
      .listen(Number(port));
  });

if (mode === "server") {
  if (await portTaken(PORT)) {
    console.error(`Port ${PORT} is already in use: a local server is probably still running in another terminal (stop it with Ctrl+C), or set LDC_LOCAL_PORT.`);
    process.exit(1);
  }
  const env = {
    ...process.env,
    ...dotenv,
    PORT,
    // No background sync timer, like production.
    SYNC_INTERVAL_MINUTES: "0",
    // The locally collected meta and test users (gitignored).
    DATABASE_PATH: process.env.LDC_LOCAL_DB ?? join(root, "apps", "server", "data", "ldc.sqlite"),
  };
  console.log(`Local coach server on http://localhost:${PORT} (stop with Ctrl+C):`);
  show(env, ["DATABASE_PATH", "RIOT_KEY_TYPE", "RIOT_PLATFORM", "RIOT_REGION"], ["RIOT_API_KEY", "ADMIN_TOKEN"]);
  run("pnpm exec tsx src/main.ts", join(root, "apps", "server"), env);
} else if (mode === "desktop") {
  const env = {
    ...process.env,
    ...dotenv,
    SERVER_URL: `http://localhost:${PORT}`,
    LDC_USER_DATA_DIR: process.env.LDC_LOCAL_PROFILE ?? join(root, ".local", "desktop-profile"),
  };
  console.log(`Panel against the local server (close the window to stop):`);
  show(env, ["SERVER_URL", "LDC_USER_DATA_DIR", "RIOT_ID"]);
  run("pnpm desktop", root, env);
} else {
  console.error("Usage: node scripts/local.mjs server|desktop");
  process.exit(1);
}
