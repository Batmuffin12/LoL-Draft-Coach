import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { TERM_NAMES, type AdviceRecord } from "@ldc/shared";
import type { Db } from "./db";
import { adviceLog } from "./db/schema";

const TermSchema = z.object({
  name: z.enum(TERM_NAMES),
  rating: z.number(),
  deltaWin: z.number(),
  games: z.number().nonnegative(),
});
const OptionSchema = z.object({
  championId: z.number().int().positive(),
  expectedWin: z.number().min(0).max(1).nullable(),
  terms: z.array(TermSchema).max(12),
});

/** POST /advice body: champion ids and numbers only (never another player). Unknown fields are dropped. */
export const AdviceRecordSchema = z.object({
  gameId: z.number().int().positive(),
  queueId: z.number().int().nullable(),
  role: z.string().max(16).nullable(),
  band: z.number().int().min(1).max(9),
  lockedAt: z.number().int().positive(),
  pick: OptionSchema,
  shown: z.array(OptionSchema).max(10),
});

/** Advice kept per user (newest); older rows are removed when a new one arrives. */
export const ADVICE_KEPT = 200;
/** Advice sent with the profile (newest first). */
export const ADVICE_IN_PROFILE = 20;

/** Stores what the coach showed for one game; a repeat for the same game replaces it. */
export function saveAdvice(db: Db, userId: number, record: AdviceRecord, now: number): void {
  db.insert(adviceLog)
    .values({ userId, gameId: record.gameId, lockedAt: record.lockedAt, championId: record.pick.championId, advice: record, createdAt: now })
    .onConflictDoUpdate({
      target: [adviceLog.userId, adviceLog.gameId],
      set: { lockedAt: record.lockedAt, championId: record.pick.championId, advice: record, createdAt: now },
    })
    .run();
  db.$client
    .prepare("DELETE FROM advice_log WHERE user_id = ? AND id NOT IN (SELECT id FROM advice_log WHERE user_id = ? ORDER BY locked_at DESC LIMIT ?)")
    .run(userId, userId, ADVICE_KEPT);
}

/** The user's most recent advice, newest first. */
export function recentAdvice(db: Db, userId: number, limit = ADVICE_IN_PROFILE): AdviceRecord[] {
  return db
    .select({ advice: adviceLog.advice })
    .from(adviceLog)
    .where(eq(adviceLog.userId, userId))
    .orderBy(desc(adviceLog.lockedAt), desc(sql`${adviceLog.id}`))
    .limit(limit)
    .all()
    .map((r) => r.advice);
}
