/**
 * Creates a one-time invite code for a friend:
 *   pnpm --filter @ldc/server invite "for Dana"        (development)
 *   node dist/invite.js "for Dana"                       (on Railway: railway run / shell)
 * Optional: --days N (default 14). The code is printed once; only its hash is stored.
 */
import { createInvite } from "./accounts";
import { openDb } from "./db";
import { readServerEnv } from "./env";

const args = process.argv.slice(2);
const daysFlag = args.indexOf("--days");
const days = daysFlag >= 0 ? Number(args[daysFlag + 1]) : 14;
const note = args.filter((_, i) => i !== daysFlag && i !== daysFlag + 1).join(" ") || undefined;

if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number");
  process.exit(1);
}

const env = readServerEnv(process.env);
const db = openDb(env.DATABASE_PATH);
const { code, expiresAt } = createInvite(db, { note, ttlDays: days, now: Date.now() });
db.$client.close();

console.log(`Invite code: ${code}`);
console.log(`Valid until ${new Date(expiresAt).toISOString().slice(0, 10)} (${days} days), one use.${note ? ` Note: ${note}` : ""}`);
