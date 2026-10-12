// Creates an invite on the live coach server and prints a message to send a friend: the join link
// (download, install, open the app with the code filled in) and the code itself.
//   pnpm invite "Dana"            (14 days)
//   pnpm invite "Dana" --days 30
// Reads ADMIN_TOKEN from .env; LDC_INVITE_SERVER overrides the server (default: production).
import { readFileSync } from "node:fs";

const SERVER = process.env.LDC_INVITE_SERVER ?? "https://ldc-server-production-c9e7.up.railway.app";
const JOIN_PAGE = "https://batmuffin12.github.io/LoL-Draft-Coach/join.html";

const args = process.argv.slice(2);
const daysAt = args.indexOf("--days");
const days = daysAt >= 0 ? Number(args[daysAt + 1]) : 14;
const name = args.filter((_, i) => daysAt < 0 || (i !== daysAt && i !== daysAt + 1)).join(" ").trim();
if (!name || !Number.isInteger(days) || days < 1) {
  console.error('Usage: pnpm invite "Friend\'s name" [--days 14]');
  process.exit(1);
}

let token = process.env.ADMIN_TOKEN;
if (!token) {
  try {
    token = /^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(new URL("../.env", import.meta.url), "utf8"))?.[1]?.trim().replace(/^"|"$/g, "");
  } catch {
    // Reported below.
  }
}
if (!token) {
  console.error("No ADMIN_TOKEN in .env (the same value as on Railway).");
  process.exit(1);
}

const res = await fetch(`${SERVER}/admin/invites`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ note: `for ${name}`, days }),
  signal: AbortSignal.timeout(60_000), // the server may need a moment to wake up
}).catch((err) => {
  console.error(`Can't reach the coach server at ${SERVER} (${err.message}).`);
  process.exit(1);
});
if (!res.ok) {
  console.error(`The server refused (HTTP ${res.status}): ${res.status === 404 ? "wrong ADMIN_TOKEN" : await res.text()}`);
  process.exit(1);
}
const { code } = await res.json();
console.log(`Invite for ${name} (works once, ${days} days):\n`);
console.log(`Hey ${name}! Here's your invite to LoL Draft Coach, a panel that helps you draft in champ select:`);
console.log(`${JOIN_PAGE}#${code}`);
console.log(`Your code: ${code}`);
