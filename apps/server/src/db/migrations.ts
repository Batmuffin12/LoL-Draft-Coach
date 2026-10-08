import type { Database } from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Forward-only SQL migrations, applied in order inside a transaction each.
 * Never edit a migration that has shipped: add a new one.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "users and invites",
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puuid TEXT NOT NULL UNIQUE,
        game_name TEXT NOT NULL,
        tag_line TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        band INTEGER,
        created_at INTEGER NOT NULL,
        last_sync_at INTEGER
      );
      CREATE TABLE invites (
        code_hash TEXT PRIMARY KEY,
        note TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        used_at INTEGER
      );
    `,
  },
  {
    version: 2,
    name: "stored matches and user history",
    sql: `
      ALTER TABLE users ADD COLUMN last_seen_at INTEGER;
      ALTER TABLE users ADD COLUMN ranked TEXT;
      CREATE TABLE matches (
        match_id TEXT PRIMARY KEY,
        queue_id INTEGER NOT NULL,
        game_version TEXT NOT NULL,
        ended_at INTEGER NOT NULL,
        duration_sec INTEGER NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX matches_ended_at ON matches(ended_at);
      CREATE TABLE user_matches (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
        participant_index INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, match_id)
      );
      CREATE INDEX user_matches_by_time ON user_matches(user_id, ended_at);
      CREATE TABLE user_masteries (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: "live meta: collected matches, collector cursor and runs, snapshots",
    sql: `
      ALTER TABLE matches ADD COLUMN band INTEGER;
      CREATE INDEX matches_band_time ON matches(band, ended_at);
      CREATE TABLE collector_cursors (
        band INTEGER PRIMARY KEY,
        tier_index INTEGER NOT NULL,
        division_index INTEGER NOT NULL,
        page INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE collector_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        new_matches INTEGER NOT NULL DEFAULT 0,
        riot_calls INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE TABLE meta_snapshots (
        band INTEGER PRIMARY KEY,
        created_at INTEGER NOT NULL,
        etag TEXT NOT NULL,
        matches INTEGER NOT NULL,
        patch TEXT,
        newest_match_at INTEGER,
        size_bytes INTEGER NOT NULL,
        body BLOB NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: "advice log: what the coach showed when each user locked in",
    sql: `
      CREATE TABLE advice_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id INTEGER NOT NULL,
        locked_at INTEGER NOT NULL,
        champion_id INTEGER NOT NULL,
        advice TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, game_id)
      );
      CREATE INDEX advice_log_by_time ON advice_log(user_id, locked_at);
    `,
  },
  {
    version: 5,
    name: "rank history: the user's own rank per day, for the monthly report",
    sql: `
      CREATE TABLE rank_history (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        queue_type TEXT NOT NULL,
        tier TEXT NOT NULL,
        rank TEXT,
        PRIMARY KEY (user_id, day, queue_type)
      );
    `,
  },
  {
    version: 6,
    name: "indexes for queries that filter matches by source (the summary JSON makes full scans expensive)",
    sql: `
      CREATE INDEX matches_source_stored ON matches(source, stored_at);
      CREATE INDEX matches_band_source_ended ON matches(band, source, ended_at);
      CREATE INDEX user_matches_by_match ON user_matches(match_id);
    `,
  },
];

/** Applies every migration newer than the database's version. Returns the versions applied. */
export function migrate(sqlite: Database, migrations: Migration[] = MIGRATIONS): number[] {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const done = new Set(
    (sqlite.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version),
  );
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (done.has(m.version)) continue;
    sqlite.transaction(() => {
      sqlite.exec(m.sql);
      sqlite.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, Date.now());
    })();
    applied.push(m.version);
  }
  return applied;
}
