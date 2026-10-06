import { and, desc, eq, gt } from "drizzle-orm";
import type { AdviceRecord, UserMatch } from "@ldc/shared";
import { recentAdvice } from "./advice";
import { publicUser, type User } from "./accounts";
import type { Db } from "./db";
import { matches, rankHistory, userMasteries, userMatches, type RankedEntry, type StoredMastery } from "./db/schema";

export interface ProfileResponse {
  user: ReturnType<typeof publicUser>;
  ranked: RankedEntry[];
  masteries: StoredMastery[];
  /** Matches that ended after `since` (all when absent), newest first. */
  matches: UserMatch[];
  /** Every match id currently in the user's history, so a client can drop pruned ones. */
  matchIds: string[];
  /** What the coach showed in your most recent games (newest first); results come from `matches`. */
  advice: AdviceRecord[];
  /** Your rank per day and queue (oldest first, the last `RANK_HISTORY_DAYS` days), for the monthly report. */
  rankHistory: { day: string; queueType: string; tier: string; rank: string | null }[];
}

/** Days of rank history sent with the profile. */
export const RANK_HISTORY_DAYS = 120;

/** The user's stored profile; with `since`, only matches newer than that (epoch ms) are included in full. */
export function loadProfile(db: Db, user: User, since?: number, now = Date.now()): ProfileResponse {
  const rows = db
    .select({ summary: matches.summary, me: userMatches.participantIndex })
    .from(userMatches)
    .innerJoin(matches, eq(matches.matchId, userMatches.matchId))
    .where(and(eq(userMatches.userId, user.id), since !== undefined ? gt(userMatches.endedAt, since) : undefined))
    .orderBy(desc(userMatches.endedAt))
    .all();
  const matchIds = db
    .select({ id: userMatches.matchId })
    .from(userMatches)
    .where(eq(userMatches.userId, user.id))
    .orderBy(desc(userMatches.endedAt))
    .all()
    .map((r) => r.id);
  return {
    user: publicUser(user),
    ranked: user.ranked ?? [],
    masteries: db.select().from(userMasteries).where(eq(userMasteries.userId, user.id)).get()?.data ?? [],
    matches: rows.map((r) => ({ match: r.summary, me: r.me })),
    matchIds,
    advice: recentAdvice(db, user.id),
    rankHistory: db
      .select({ day: rankHistory.day, queueType: rankHistory.queueType, tier: rankHistory.tier, rank: rankHistory.rank })
      .from(rankHistory)
      .where(and(eq(rankHistory.userId, user.id), gt(rankHistory.day, new Date(now - RANK_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10))))
      .orderBy(rankHistory.day)
      .all(),
  };
}
