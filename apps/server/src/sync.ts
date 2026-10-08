import { and, desc, eq, gte, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { bandFromRankedEntries, type AppConfig, type RankBandConfig } from "@ldc/engine";
import { deathsBefore, participantIndex, RiotKeyError, summarizeMatch, summarizeTimeline, withEarlyDeaths, type Mastery, type RiotApi } from "@ldc/riot-api";
import type { User } from "./accounts";
import type { Db } from "./db";
import { isForeignPuuidError, isSamePlayer } from "./identity";
import { matches, rankHistory, userMasteries, userMatches, users, type StoredMastery } from "./db/schema";

/** Maximum page size of Match-V5 "ids by puuid" (documented API limit). */
export const MATCH_IDS_PAGE = 100;

/** What syncing needs from the Riot API adapter. */
export type SyncRiot = Pick<RiotApi, "accountByRiotId" | "masteriesByPuuid" | "leagueEntriesByPuuid" | "matchIdsByPuuid" | "match"> & Partial<Pick<RiotApi, "timeline">>;

/**
 * The user's masteries and their PUUID for the server's current key. PUUIDs are encrypted
 * per API key, so a stored one stops working when the key changes (e.g. development to
 * personal key) and Riot answers HTTP 400. Then the user is looked up again by Riot ID
 * and, once that account is confirmed to be the same player, the new PUUID is stored.
 */
async function masteriesWithCurrentPuuid(db: Db, riot: SyncRiot, user: User): Promise<{ puuid: string; masteries: Mastery[] }> {
  try {
    return { puuid: user.puuid, masteries: await riot.masteriesByPuuid(user.puuid) };
  } catch (err) {
    if (!isForeignPuuidError(err)) throw err;
    const account = await riot.accountByRiotId(user.gameName, user.tagLine);
    if (!account || account.puuid === user.puuid) throw err;
    if (!(await isSamePlayer(db, riot, user, account.puuid, { storedPuuidForeign: true }))) {
      throw new Error(`${user.gameName}#${user.tagLine} now belongs to a different Riot account; the user must register again.`);
    }
    if (db.select({ id: users.id }).from(users).where(eq(users.puuid, account.puuid)).get()) {
      throw new Error(`${user.gameName}#${user.tagLine} is registered again as another user; this older user can be deleted.`);
    }
    db.update(users).set({ puuid: account.puuid }).where(eq(users.id, user.id)).run();
    return { puuid: account.puuid, masteries: await riot.masteriesByPuuid(account.puuid) };
  }
}

export interface SyncSettings {
  history: AppConfig["history"];
  bands: RankBandConfig;
  /** Engine `earlyDeathsMinute`: deaths before it are stamped on your games that have a timeline. */
  earlyDeathsMinute?: number;
}

export interface SyncResult {
  newMatches: number;
  totalMatches: number;
  band: number;
}

/** Sorts Match-V5 ids newest first by their numeric part (e.g. EUW1_7123456789). */
export function sortMatchIdsNewestFirst(ids: string[]): string[] {
  const num = (id: string) => Number(/_(\d+)$/.exec(id)?.[1] ?? 0);
  return [...new Set(ids)].sort((a, b) => num(b) - num(a));
}

/**
 * Brings one user's stored history up to date: mastery, ranked entries and band, and
 * their newest matches (up to history.matchCount across the configured queues). Only
 * matches not yet linked to the user are fetched. Matches are stored anonymised; the
 * user's participant is kept as an index.
 */
export async function syncUser(
  db: Db,
  riot: SyncRiot,
  user: User,
  settings: SyncSettings,
  now: number,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  const { history } = settings;

  const current = await masteriesWithCurrentPuuid(db, riot, user);
  const { puuid } = current;
  const masteries: StoredMastery[] = current.masteries.map((m) => ({
    championId: m.championId,
    level: m.championLevel,
    points: m.championPoints,
    ...(m.lastPlayTime !== undefined ? { lastPlayTime: m.lastPlayTime } : {}),
    ...(m.milestoneGrades ? { grades: m.milestoneGrades } : {}),
  }));
  const ranked = (await riot.leagueEntriesByPuuid(puuid)).map((e) => ({
    queueType: e.queueType,
    tier: e.tier,
    ...(e.rank !== undefined ? { rank: e.rank } : {}),
    ...(e.wins !== undefined ? { wins: e.wins } : {}),
    ...(e.losses !== undefined ? { losses: e.losses } : {}),
  }));
  const band = bandFromRankedEntries(ranked, settings.bands);

  const idPages: string[][] = [];
  for (const queue of history.queues) {
    for (let start = 0; start < history.matchCount; start += MATCH_IDS_PAGE) {
      const page = await riot.matchIdsByPuuid(puuid, { queue, start, count: Math.min(MATCH_IDS_PAGE, history.matchCount - start) });
      idPages.push(page);
      if (page.length < MATCH_IDS_PAGE) break;
    }
  }
  const wanted = sortMatchIdsNewestFirst(idPages.flat()).slice(0, history.matchCount);
  const have = new Set(
    wanted.length
      ? db
          .select({ id: userMatches.matchId })
          .from(userMatches)
          .where(and(eq(userMatches.userId, user.id), inArray(userMatches.matchId, wanted)))
          .all()
          .map((r) => r.id)
      : [],
  );
  const missing = wanted.filter((id) => !have.has(id));

  let added = 0;
  for (let i = 0; i < missing.length; i++) {
    const id = missing[i]!;
    // The raw match is needed even when another user already stored it: only the raw
    // payload says which participant this user was (stored summaries carry no PUUIDs).
    const match = await riot.match(id);
    const index = match ? participantIndex(match, puuid) : -1;
    if (match && index >= 0) {
      let summary = summarizeMatch(match);
      // Your newest games also get their timeline (when you die, your gold at 15); a failed one is skipped.
      if (riot.timeline && wanted.indexOf(id) < (history.timelineCount ?? 0)) {
        const timeline = await riot.timeline(id).catch((err: unknown) => {
          if (err instanceof RiotKeyError) throw err;
          return null;
        });
        if (timeline) {
          summary = { ...summary, timeline: summarizeTimeline(timeline, match) };
          if (settings.earlyDeathsMinute) summary = withEarlyDeaths(summary, deathsBefore(timeline, match, settings.earlyDeathsMinute * 60));
        }
      }
      db.transaction((tx) => {
        tx.insert(matches)
          .values({
            matchId: summary.matchId,
            queueId: summary.queueId,
            gameVersion: summary.gameVersion,
            endedAt: summary.endedAt,
            durationSec: summary.durationSec,
            summary,
            source: "user",
            storedAt: now,
          })
          .onConflictDoNothing()
          .run();
        tx.insert(userMatches)
          .values({ userId: user.id, matchId: summary.matchId, participantIndex: index, endedAt: summary.endedAt })
          .onConflictDoNothing()
          .run();
      });
      added++;
    }
    onProgress?.(i + 1, missing.length);
  }

  db.transaction((tx) => {
    tx.insert(userMasteries)
      .values({ userId: user.id, data: masteries, updatedAt: now })
      .onConflictDoUpdate({ target: userMasteries.userId, set: { data: masteries, updatedAt: now } })
      .run();
    tx.update(users).set({ band, ranked, lastSyncAt: now }).where(eq(users.id, user.id)).run();
    // The rank today (the last sync of the day wins), for the monthly report's rank trend.
    const day = new Date(now).toISOString().slice(0, 10);
    for (const r of ranked) {
      tx.insert(rankHistory)
        .values({ userId: user.id, day, queueType: r.queueType, tier: r.tier, rank: r.rank ?? null })
        .onConflictDoUpdate({ target: [rankHistory.userId, rankHistory.day, rankHistory.queueType], set: { tier: r.tier, rank: r.rank ?? null } })
        .run();
    }
  });
  pruneUserHistory(db, user.id, history.matchCount);

  const totalMatches = db.select({ n: sql<number>`count(*)` }).from(userMatches).where(eq(userMatches.userId, user.id)).get()?.n ?? 0;
  return { newMatches: added, totalMatches, band };
}

/** Keeps the user's newest `keep` matches, then deletes user-history matches nobody references any more. */
export function pruneUserHistory(db: Db, userId: number, keep: number): void {
  const cutoff = db
    .select({ endedAt: userMatches.endedAt })
    .from(userMatches)
    .where(eq(userMatches.userId, userId))
    .orderBy(desc(userMatches.endedAt))
    .limit(1)
    .offset(keep - 1)
    .get();
  if (cutoff) db.delete(userMatches).where(and(eq(userMatches.userId, userId), lt(userMatches.endedAt, cutoff.endedAt))).run();
  deleteOrphanUserMatches(db);
}

/** Deletes matches stored for user histories that no user links to (e.g. after DELETE /me). */
export function deleteOrphanUserMatches(db: Db): void {
  db.delete(matches)
    .where(
      and(
        eq(matches.source, "user"),
        notExists(db.select({ x: sql`1` }).from(userMatches).where(eq(userMatches.matchId, matches.matchId))),
      ),
    )
    .run();
}

/** Users who were active recently and whose last sync is older than `staleAfterMs`. */
export function usersDueForSync(db: Db, now: number, staleAfterMs: number, activeWithinMs: number): User[] {
  return db
    .select()
    .from(users)
    .where(
      and(
        gte(users.lastSeenAt, now - activeWithinMs),
        or(isNull(users.lastSyncAt), lt(users.lastSyncAt, now - staleAfterMs)),
      ),
    )
    .all();
}
