/**
 * Test the current branch against a local coach server instead of production:
 *   pnpm local:server    the server on http://localhost:8788 with apps/server/data/ldc.sqlite
 *   pnpm local:desktop   the panel in server mode against it, with its own profile in .local/desktop-profile
 * Run each in its own terminal. Both read the repo's .env and add the local settings on top
 * (.env < local settings < LDC_LOCAL_* overrides); nothing in .env or your normal app profile changes.
 * First time: register the panel with an invite from `pnpm --filter @ldc/server invite "local"`.
 * More meta data: `pnpm --filter @ldc/server collect --seconds 900` (then restart the server).
 *
 * Or test the panel on real data without copying anything:
 *   pnpm local:prod          this branch's panel against the production server (your account, your
 *                            games, the live meta), with this branch's config and wording
 *                            (LDC_BUNDLED_CONFIG); its own profile in .local/desktop-prod
 *                            first run: makes a production invite (ADMIN_TOKEN) and the panel
 *                            registers itself once the League client is logged in
 *   pnpm local:prod <name>   the same with its own profile (.local/desktop-prod-<name>), for another League
 *                            account: log into the client with it first
 *   pnpm local:prod invite   just print a one-day production invite
 * Server-side changes (how snapshots are built) show there only after a deploy.
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
/** The production server (CLAUDE.md, Railway). */
const PROD_URL = process.env.LDC_PROD_URL ?? "https://ldc-server-production-c9e7.up.railway.app";
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

/** A one-day invite from the production server (needs .env's ADMIN_TOKEN to be production's). */
async function prodInvite() {
  const token = process.env.ADMIN_TOKEN ?? dotenv.ADMIN_TOKEN;
  if (!token) {
    console.error("ADMIN_TOKEN isn't set in .env: it must be the production server's admin token.");
    process.exit(1);
  }
  const res = await fetch(`${PROD_URL}/admin/invites`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ note: "local:prod", days: 1 }),
  });
  if (!res.ok) {
    console.error(`The production server refused the invite (HTTP ${res.status}).${res.status === 401 ? " .env's ADMIN_TOKEN differs from production's." : ""}`);
    process.exit(1);
  }
  return (await res.json()).code;
}

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
  // A registered profile keeps using the server it registered with, whatever SERVER_URL says.
  try {
    const registered = JSON.parse(readFileSync(join(env.LDC_USER_DATA_DIR, "account.json"), "utf8")).serverUrl;
    if (registered && registered !== env.SERVER_URL) {
      console.warn(`  Note: this profile is registered to ${registered}, so the panel talks to that server. Sign out in the panel to register with ${env.SERVER_URL}.`);
    }
  } catch {
    // Not registered yet: the panel offers to register with SERVER_URL.
  }
  run("pnpm desktop", root, env);
} else if (mode === "prod" && process.argv[3] === "invite") {
  const code = await prodInvite();
  console.log(`Invite for ${PROD_URL} (valid 1 day): ${code}\nRegister with it in the panel from \`pnpm local:prod\` (your Riot ID: the same account and games).`);
} else if (mode === "prod") {
  // `pnpm local:prod subnoraa`: a separate test profile per League account (log into the client
  // with that account; the panel always uses the account logged into the client).
  const account = process.argv[3]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const env = {
    ...process.env,
    ...dotenv,
    SERVER_URL: PROD_URL,
    LDC_USER_DATA_DIR: process.env.LDC_LOCAL_PROFILE ?? join(root, ".local", account ? `desktop-prod-${account}` : "desktop-prod"),
    // This branch's config and wording, not production's.
    LDC_BUNDLED_CONFIG: "1",
  };
  console.log("This branch's panel on production data (close the window to stop):");
  show(env, ["SERVER_URL", "LDC_USER_DATA_DIR", "LDC_BUNDLED_CONFIG"]);
  if (!existsSync(join(env.LDC_USER_DATA_DIR, "account.json"))) {
    // First run: register automatically once the League client is logged in (it gives the Riot ID).
    env.LDC_AUTO_REGISTER = await prodInvite();
    console.log(`  First run: the panel registers on its own once the League client is open and logged in${account ? ` (as ${process.argv[3]})` : ""}.`);
  }
  run("pnpm desktop", root, env);
} else {
  console.error("Usage: node scripts/local.mjs server|desktop|prod [invite]");
  process.exit(1);
}
