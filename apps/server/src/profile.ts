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
  const { user: pub, ranked, masteries, matchIds, advice, rankHistory } = profileRest(db, user, now);
  return { user: pub, ranked, masteries, matches: rows.map((r) => ({ match: r.summary, me: r.me })), matchIds, advice, rankHistory };
}

/**
 * The same profile (plus `extra` fields) as JSON text, for GET /me/profile. Match summaries are
 * stored as JSON already: they go into the response as stored, instead of being parsed and
 * stringified again (a full history is about 14 MB of JSON).
 */
export function profileJson(db: Db, user: User, since: number | undefined, now: number, extra: Record<string, unknown>): string {
  const rows = db.$client
    .prepare(
      `SELECT m.summary AS summary, um.participant_index AS me FROM user_matches um JOIN matches m ON m.match_id = um.match_id
       WHERE um.user_id = ?${since !== undefined ? " AND um.ended_at > ?" : ""} ORDER BY um.ended_at DESC`,
    )
    .all(...(since !== undefined ? [user.id, since] : [user.id])) as { summary: string; me: number }[];
  const { user: pub, ranked, masteries, matchIds, advice, rankHistory } = profileRest(db, user, now);
  const head = JSON.stringify({ user: pub, ranked, masteries });
  const tail = JSON.stringify({ matchIds, advice, rankHistory, ...extra });
  const list = rows.map((r) => `{"match":${r.summary},"me":${r.me}}`).join(",");
  // Same keys, same order as loadProfile's object: user, ranked, masteries, matches, matchIds, advice, rankHistory, then extra.
  return `${head.slice(0, -1)},"matches":[${list}],${tail.slice(1)}`;
}

/** Everything in the profile but the matches. */
function profileRest(db: Db, user: User, now: number): Omit<ProfileResponse, "matches"> {
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
