import { and, desc, eq, gt } from "drizzle-orm";
import type { AdviceRecord, UserMatch } from "@ldc/shared";
import { recentAdvice } from "./advice";
import { publicUser, type User } from "./accounts";
import type { Db } from "./db";
import { rankHistory, userMasteries, userMatches, type RankedEntry, type StoredMastery } from "./db/schema";

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

/** Match ids asked for by name (GET /me/profile?ids=) at most. */
export const PROFILE_IDS_MAX = 100;

export interface ProfileOptions {
  /** Also these matches in full, whatever `since` says (the user's own only; unknown ids are skipped). */
  ids?: string[];
  /** Add `timelineIds`: the user's matches whose stored summary has a complete timeline (epic monsters kept). */
  timelines?: boolean;
}

/** The SQL for the user's matches: all, or newer than `since` plus the named ones. Newest first. */
function matchRows(db: Db, user: User, since: number | undefined, ids: string[]): { summary: string; me: number }[] {
  const filter = since === undefined ? "" : ` AND (um.ended_at > ?${ids.length ? ` OR um.match_id IN (${ids.map(() => "?").join(",")})` : ""})`;
  return db.$client
    .prepare(`SELECT m.summary AS summary, um.participant_index AS me FROM user_matches um JOIN matches m ON m.match_id = um.match_id WHERE um.user_id = ?${filter} ORDER BY um.ended_at DESC`)
    .all(user.id, ...(since === undefined ? [] : [since, ...ids])) as { summary: string; me: number }[];
}

/** The user's matches that have a complete timeline (what sync.ts fetches a timeline again for when it lacks one). */
function timelineIds(db: Db, user: User): string[] {
  return (
    db.$client
      .prepare("SELECT um.match_id AS id FROM user_matches um JOIN matches m ON m.match_id = um.match_id WHERE um.user_id = ? AND json_type(m.summary, '$.timeline.monsters') IS NOT NULL ORDER BY um.ended_at DESC")
      .all(user.id) as { id: string }[]
  ).map((r) => r.id);
}

/** The user's stored profile; with `since`, only matches newer than that (epoch ms) are included in full. */
export function loadProfile(db: Db, user: User, since?: number, now = Date.now(), opts: ProfileOptions = {}): ProfileResponse & { timelineIds?: string[] } {
  const rows = matchRows(db, user, since, opts.ids ?? []);
  const { user: pub, ranked, masteries, matchIds, advice, rankHistory } = profileRest(db, user, now);
  return {
    user: pub,
    ranked,
    masteries,
    matches: rows.map((r) => ({ match: JSON.parse(r.summary) as UserMatch["match"], me: r.me })),
    matchIds,
    advice,
    rankHistory,
    ...(opts.timelines ? { timelineIds: timelineIds(db, user) } : {}),
  };
}

/**
 * The same profile (plus `extra` fields) as JSON text, for GET /me/profile. Match summaries are
 * stored as JSON already: they go into the response as stored, instead of being parsed and
 * stringified again (a full history is about 14 MB of JSON).
 */
export function profileJson(db: Db, user: User, since: number | undefined, now: number, extra: Record<string, unknown>, opts: ProfileOptions = {}): string {
  const rows = matchRows(db, user, since, opts.ids ?? []);
  const { user: pub, ranked, masteries, matchIds, advice, rankHistory } = profileRest(db, user, now);
  const head = JSON.stringify({ user: pub, ranked, masteries });
  const tail = JSON.stringify({ matchIds, advice, rankHistory, ...(opts.timelines ? { timelineIds: timelineIds(db, user) } : {}), ...extra });
  const list = rows.map((r) => `{"match":${r.summary},"me":${r.me}}`).join(",");
  // Same keys, same order as loadProfile's object: user, ranked, masteries, matches, matchIds, advice, rankHistory, [timelineIds,] then extra.
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
