import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { MatchSummary } from "@ldc/shared";

/**
 * Drizzle table definitions for typed queries. The tables themselves are created by
 * the SQL migrations in ./migrations.ts; a test checks the two stay in step.
 */

/** A registered player. Only their own data is ever stored against them. */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** PUUID as returned for the server's API key (PUUIDs are encrypted per key). */
  puuid: text("puuid").notNull().unique(),
  gameName: text("game_name").notNull(),
  tagLine: text("tag_line").notNull(),
  /** SHA-256 of the bearer token; the token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  band: integer("band"),
  createdAt: integer("created_at").notNull(),
  lastSyncAt: integer("last_sync_at"),
  /** Last authenticated request; background sync only runs for recently active users. */
  lastSeenAt: integer("last_seen_at"),
  /** The user's own League-V4 entries (queue, tier, division, wins, losses). */
  ranked: text("ranked", { mode: "json" }).$type<RankedEntry[]>(),
});

export interface RankedEntry {
  queueType: string;
  tier: string;
  rank?: string;
  wins?: number;
  losses?: number;
}

/** A stored match (anonymised summary). Shared by every user who played in it, and later by the collector. */
export const matches = sqliteTable("matches", {
  matchId: text("match_id").primaryKey(),
  queueId: integer("queue_id").notNull(),
  gameVersion: text("game_version").notNull(),
  endedAt: integer("ended_at").notNull(),
  durationSec: integer("duration_sec").notNull(),
  summary: text("summary", { mode: "json" }).$type<MatchSummary>().notNull(),
  /** "user" for a registered user's history, "collector" for meta collection. */
  source: text("source").notNull(),
  storedAt: integer("stored_at").notNull(),
  /** Rank band the collector sampled this match for (null: only in a user's history). */
  band: integer("band"),
});

/** Where the collector continues reading League-V4 player lists, per band. No player data. */
export const collectorCursors = sqliteTable("collector_cursors", {
  band: integer("band").primaryKey(),
  tierIndex: integer("tier_index").notNull(),
  divisionIndex: integer("division_index").notNull(),
  page: integer("page").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** One hourly collector wake-up, for /health and the cost log. */
export const collectorRuns = sqliteTable("collector_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  newMatches: integer("new_matches").notNull().default(0),
  riotCalls: integer("riot_calls").notNull().default(0),
  error: text("error"),
});

/** The latest published meta snapshot per band: gzipped JSON, served by GET /meta/:band. */
export const metaSnapshots = sqliteTable("meta_snapshots", {
  band: integer("band").primaryKey(),
  createdAt: integer("created_at").notNull(),
  etag: text("etag").notNull(),
  matches: integer("matches").notNull(),
  patch: text("patch"),
  newestMatchAt: integer("newest_match_at"),
  sizeBytes: integer("size_bytes").notNull(),
  body: blob("body", { mode: "buffer" }).notNull(),
});

/** Which matches belong to a user's history, and which participant they were. */
export const userMatches = sqliteTable(
  "user_matches",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    participantIndex: integer("participant_index").notNull(),
    endedAt: integer("ended_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.matchId] })],
);

export interface StoredMastery {
  championId: number;
  level: number;
  points: number;
  lastPlayTime?: number;
  grades?: string[];
}

/** The user's champion mastery, refreshed on every sync. */
export const userMasteries = sqliteTable("user_masteries", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).$type<StoredMastery[]>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** One-time invite codes created by the owner. */
export const invites = sqliteTable("invites", {
  /** SHA-256 of the code; the code itself is shown once and never stored. */
  codeHash: text("code_hash").primaryKey(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedBy: integer("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: integer("used_at"),
});
