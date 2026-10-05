import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
