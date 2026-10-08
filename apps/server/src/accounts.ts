import { and, eq } from "drizzle-orm";
import type { RiotApi } from "@ldc/riot-api";
import { newInviteCode, newToken, normalizeInviteCode, sha256 } from "./auth";
import type { Db } from "./db";
import { invites, users } from "./db/schema";
import { isSamePlayer, type IdentityRiot } from "./identity";
import { deleteOrphanUserMatches } from "./sync";

const DAY_MS = 86_400_000;

export type User = typeof users.$inferSelect;

/**
 * What registration needs from the Riot API adapter. Without the identity calls, a returning
 * player under a new PUUID gets a new user instead of their old one.
 */
export type AccountLookup = Pick<RiotApi, "accountByRiotId"> & Partial<IdentityRiot>;

export class AccountError extends Error {
  constructor(
    readonly code: "invalid_riot_id" | "invite_invalid" | "riot_id_not_found",
    message: string,
  ) {
    super(message);
  }
}

/** Splits "Name#TAG" on the last "#". Names may contain spaces; neither part may be empty. */
export function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const i = riotId.lastIndexOf("#");
  const gameName = riotId.slice(0, i).trim();
  const tagLine = riotId.slice(i + 1).trim();
  if (i < 0 || !gameName || !tagLine || riotId.length > 64) {
    throw new AccountError("invalid_riot_id", 'A Riot ID looks like "Name#TAG".');
  }
  return { gameName, tagLine };
}

/** Creates a one-time invite code. The code is returned once; only its hash is stored. */
export function createInvite(db: Db, opts: { note?: string; ttlDays: number; now: number }): { code: string; expiresAt: number } {
  const code = newInviteCode();
  const expiresAt = opts.now + opts.ttlDays * DAY_MS;
  db.insert(invites)
    .values({ codeHash: sha256(normalizeInviteCode(code)), note: opts.note ?? null, createdAt: opts.now, expiresAt })
    .run();
  return { code, expiresAt };
}

/**
 * Registers the player behind a Riot ID using a one-time invite, and returns a new
 * bearer token. If the account is already registered (e.g. a reinstall), its token is
 * replaced, so the old one stops working. The invite is consumed either way.
 */
export async function registerUser(
  db: Db,
  riot: AccountLookup,
  input: { inviteCode: string; riotId: string },
  now: number,
): Promise<{ token: string; user: User }> {
  const { gameName, tagLine } = parseRiotId(input.riotId);
  const codeHash = sha256(normalizeInviteCode(input.inviteCode));
  const invite = db.select().from(invites).where(eq(invites.codeHash, codeHash)).get();
  if (!invite || invite.usedAt !== null || invite.expiresAt <= now) {
    throw new AccountError("invite_invalid", "This invite code is wrong, already used or expired. Ask for a new one.");
  }

  // Network call before any write, so a Riot failure leaves the invite unused.
  const account = await riot.accountByRiotId(gameName, tagLine);
  if (!account) throw new AccountError("riot_id_not_found", `No Riot account called ${gameName}#${tagLine} was found.`);

  // After an API key change the same player comes back with a new PUUID: their old user (same
  // Riot ID) is reused only when it is provably the same player (Riot IDs change hands).
  let returning: User | undefined;
  if (!db.select().from(users).where(eq(users.puuid, account.puuid)).get()) {
    const byRiotId = db
      .select()
      .from(users)
      .where(and(eq(users.gameName, account.gameName ?? gameName), eq(users.tagLine, account.tagLine ?? tagLine)))
      .get();
    if (byRiotId && riot.masteriesByPuuid && riot.matchIdsByPuuid) {
      const identity = { masteriesByPuuid: riot.masteriesByPuuid.bind(riot), matchIdsByPuuid: riot.matchIdsByPuuid.bind(riot) };
      if (await isSamePlayer(db, identity, byRiotId, account.puuid)) returning = byRiotId;
    }
  }

  const token = newToken();
  const tokenHash = sha256(token);
  const user = db.transaction((tx) => {
    // Re-check inside the transaction: two registrations may race for one invite.
    const fresh = tx.select().from(invites).where(eq(invites.codeHash, codeHash)).get();
    if (!fresh || fresh.usedAt !== null) {
      throw new AccountError("invite_invalid", "This invite code is wrong, already used or expired. Ask for a new one.");
    }
    const existing =
      tx.select().from(users).where(eq(users.puuid, account.puuid)).get() ??
      (returning ? tx.select().from(users).where(eq(users.id, returning.id)).get() : undefined);
    const saved = existing
      ? tx
          .update(users)
          .set({ puuid: account.puuid, tokenHash, gameName: account.gameName ?? gameName, tagLine: account.tagLine ?? tagLine })
          .where(eq(users.id, existing.id))
          .returning()
          .get()
      : tx
          .insert(users)
          .values({
            puuid: account.puuid,
            gameName: account.gameName ?? gameName,
            tagLine: account.tagLine ?? tagLine,
            tokenHash,
            createdAt: now,
          })
          .returning()
          .get();
    tx.update(invites).set({ usedBy: saved.id, usedAt: now }).where(eq(invites.codeHash, codeHash)).run();
    return saved;
  });
  return { token, user };
}

/** The user a bearer token belongs to, or null. */
export function userByToken(db: Db, token: string): User | null {
  return db.select().from(users).where(eq(users.tokenHash, sha256(token))).get() ?? null;
}

/** Deletes the user and everything stored for them. */
export function deleteUser(db: Db, userId: number): void {
  // user_matches and user_masteries cascade; matches only this user had are then removed.
  db.delete(users).where(eq(users.id, userId)).run();
  deleteOrphanUserMatches(db);
}

/** What the API shows about a user: never the PUUID or token hash. */
export function publicUser(u: User) {
  return {
    id: u.id,
    riotId: `${u.gameName}#${u.tagLine}`,
    band: u.band,
    createdAt: u.createdAt,
    lastSyncAt: u.lastSyncAt,
    /** Games of your history still loading in the background (0: complete; null: first sync not done). */
    historyBacklog: u.historyBacklog ?? null,
  };
}

/** Records activity at most once per `everyMs` (background sync only follows active users). */
export function touchUser(db: Db, user: User, now: number, everyMs = 60_000): void {
  if (user.lastSeenAt !== null && now - user.lastSeenAt < everyMs) return;
  db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id)).run();
}
