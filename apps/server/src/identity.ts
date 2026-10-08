import { desc, eq } from "drizzle-orm";
import { RiotApiError, RiotKeyError, type RiotApi } from "@ldc/riot-api";
import type { User } from "./accounts";
import type { Db } from "./db";
import { userMatches } from "./db/schema";

/** What confirming a player's identity needs from the Riot API adapter. */
export type IdentityRiot = Pick<RiotApi, "masteriesByPuuid" | "matchIdsByPuuid">;

/** The user's newest stored games compared against the account's newest ids (a Match-V5 page). */
const STORED_TO_COMPARE = 20;
const RECENT_IDS = 100;

/** Riot's answer for a PUUID encrypted by another API key: HTTP 400 (a rejected key is a different error). */
export function isForeignPuuidError(err: unknown): boolean {
  return err instanceof RiotApiError && !(err instanceof RiotKeyError) && err.status === 400;
}

/**
 * After an API key change a user comes back under a new PUUID, found by Riot ID. A Riot ID can
 * change hands (renames), so the new account counts as the same player only when the stored
 * PUUID no longer works under this key, and the account's newest games include a game stored for
 * the user (match ids don't depend on the key). A user without stored games has nothing to
 * compare: the account is taken as theirs.
 */
export async function isSamePlayer(db: Db, riot: IdentityRiot, user: User, newPuuid: string, opts: { storedPuuidForeign?: boolean } = {}): Promise<boolean> {
  if (!opts.storedPuuidForeign) {
    try {
      await riot.masteriesByPuuid(user.puuid);
      return false; // the stored PUUID still works: it is someone else's Riot ID now
    } catch (err) {
      if (!isForeignPuuidError(err)) throw err;
    }
  }
  const stored = db
    .select({ id: userMatches.matchId })
    .from(userMatches)
    .where(eq(userMatches.userId, user.id))
    .orderBy(desc(userMatches.endedAt))
    .limit(STORED_TO_COMPARE)
    .all()
    .map((r) => r.id);
  if (!stored.length) return true;
  const recent = new Set(await riot.matchIdsByPuuid(newPuuid, { count: RECENT_IDS }));
  return stored.some((id) => recent.has(id));
}
