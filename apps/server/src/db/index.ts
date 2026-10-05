import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "./migrations";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: BetterSqlite3.Database };

/**
 * Opens (creating if needed) the SQLite database and brings it to the latest schema.
 * ":memory:" gives a throwaway database for tests.
 */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(sqlite);
  return drizzle({ client: sqlite, schema });
}

export { schema };
