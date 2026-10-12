import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import BetterSqlite3 from "better-sqlite3";
import { desc, eq, isNotNull } from "drizzle-orm";
import type { BackupStore } from "./backup-store";
import type { Db } from "./db";
import { backups } from "./db/schema";

/**
 * The data that can't be rebuilt: who is registered, invites, the advice log and rank history.
 * Games, masteries and the meta come back by themselves (user sync, collector), so they're left out.
 */
const BACKUP_TABLES = ["schema_migrations", "users", "invites", "advice_log", "rank_history"] as const;

const MAGIC = Buffer.from("LDCB1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Copies the database's schema (every table, empty) plus the rows of BACKUP_TABLES into a new
 * SQLite file. The copy is a working database: a server started on it keeps every user signed in,
 * and their games reload on the next sync. Reads the source in one transaction (a consistent copy
 * while the server keeps writing).
 */
export function copyUserData(sourcePath: string, destPath: string): { users: number } {
  const dest = new BetterSqlite3(destPath);
  try {
    dest.pragma("foreign_keys = OFF");
    dest.prepare("ATTACH DATABASE ? AS src").run(sourcePath);
    dest.transaction(() => {
      const objects = dest
        .prepare("SELECT sql FROM src.sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'table' DESC, rowid")
        .all() as { sql: string }[];
      for (const o of objects) dest.exec(o.sql);
      for (const t of BACKUP_TABLES) dest.exec(`INSERT INTO main.${t} SELECT * FROM src.${t}`);
      // No games in the copy: each user's history loads again from scratch on their next sync.
      dest.exec("UPDATE main.users SET last_sync_at = NULL, history_backlog = NULL");
    })();
    dest.exec("DETACH DATABASE src");
    return { users: (dest.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n };
  } finally {
    dest.close();
  }
}

/** gzip, then AES-256-GCM: the storage provider only ever sees ciphertext. Layout: magic, IV, tag, data. */
export function sealBackup(plain: Uint8Array, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), data]);
}

/** Reverses sealBackup; throws on a wrong key or a damaged file. */
export function openBackup(sealed: Uint8Array, key: Buffer): Buffer {
  const buf = Buffer.from(sealed);
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a LoL Draft Coach backup file.");
  const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = buf.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(buf.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]));
  } catch {
    throw new Error("The backup can't be decrypted: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged.");
  }
}

export interface BackupOptions {
  /** 32-byte AES key (BACKUP_ENCRYPTION_KEY). */
  key: Buffer;
  /** A backup is due this long after the last good one (a wake-up up to 30 min early counts). */
  everyMs: number;
  /** Older backups are deleted from the store. */
  keepMs: number;
  /** Object name prefix in the bucket. */
  prefix?: string;
  now?: () => number;
}

export interface BackupRun {
  startedAt: number;
  finishedAt: number | null;
  objectKey: string | null;
  bytes: number | null;
  users: number | null;
  error: string | null;
}

const EARLY_MS = 30 * 60_000;

/** The daily backup, run inside the hourly wake-up (no timer of its own, so the server can sleep). */
export class BackupJob {
  private current: Promise<BackupRun> | null = null;
  private readonly now: () => number;
  readonly prefix: string;

  constructor(
    private readonly db: Db,
    private readonly dbPath: string,
    private readonly store: BackupStore,
    private readonly opts: BackupOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.prefix = opts.prefix ?? "users/";
  }

  get running(): boolean {
    return this.current !== null;
  }

  lastRun(): BackupRun | null {
    return this.db.select().from(backups).orderBy(desc(backups.id)).limit(1).get() ?? null;
  }

  lastGoodAt(): number | null {
    return this.db.select({ t: backups.finishedAt }).from(backups).where(isNotNull(backups.objectKey)).orderBy(desc(backups.id)).limit(1).get()?.t ?? null;
  }

  due(): boolean {
    const last = this.lastGoodAt();
    return last === null || this.now() - last >= this.opts.everyMs - EARLY_MS;
  }

  /** For /health: stale when no good backup for twice the interval. */
  health() {
    const last = this.lastRun();
    const lastGoodAt = this.lastGoodAt();
    return {
      lastGoodAt,
      stale: lastGoodAt === null || this.now() - lastGoodAt > 2 * this.opts.everyMs,
      lastRun: last && { startedAt: last.startedAt, finishedAt: last.finishedAt, users: last.users, bytes: last.bytes, error: last.error },
    };
  }

  /** Starts a backup when one is due (and none is running); otherwise resolves to null. */
  runIfDue(): Promise<BackupRun | null> {
    if (this.current || !this.due()) return Promise.resolve(null);
    return this.run();
  }

  run(): Promise<BackupRun> {
    this.current ??= this.backup().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async backup(): Promise<BackupRun> {
    const startedAt = this.now();
    const id = this.db.insert(backups).values({ startedAt }).returning({ id: backups.id }).get().id;
    const dir = mkdtempSync(join(tmpdir(), "ldc-backup-"));
    try {
      const file = join(dir, "users.sqlite");
      const { users } = copyUserData(this.dbPath, file);
      const sealed = sealBackup(readFileSync(file), this.opts.key);
      const objectKey = `${this.prefix}${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.ldcb`;
      await this.store.put(objectKey, sealed);
      const done = { finishedAt: this.now(), objectKey, bytes: sealed.length, users, error: null };
      this.db.update(backups).set(done).where(eq(backups.id, id)).run();
      await this.prune().catch((err: unknown) => console.warn("backup prune failed:", err));
      return { startedAt, ...done };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.db.update(backups).set({ finishedAt: this.now(), error }).where(eq(backups.id, id)).run();
      console.error("backup failed:", error);
      return { startedAt, finishedAt: this.now(), objectKey: null, bytes: null, users: null, error };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Deletes backups older than keepMs (the bucket's own lifecycle rule does the same; this is the fallback). */
  private async prune(): Promise<void> {
    const cutoff = this.now() - this.opts.keepMs;
    for (const o of await this.store.list(this.prefix)) if (o.lastModified < cutoff) await this.store.delete(o.key);
  }
}

/**
 * Downloads a backup (the newest when `objectKey` is null), decrypts it and writes the SQLite file to
 * `outPath`, after checking it opens and passes SQLite's integrity check.
 */
export async function restoreBackup(store: BackupStore, key: Buffer, outPath: string, objectKey: string | null, prefix = "users/"): Promise<{ objectKey: string; users: number }> {
  const chosen = objectKey ?? (await store.list(prefix)).map((o) => o.key).sort().at(-1);
  if (!chosen) throw new Error("No backups in the bucket.");
  writeFileSync(outPath, openBackup(await store.get(chosen), key));
  const db = new BetterSqlite3(outPath, { readonly: true });
  try {
    const check = db.pragma("integrity_check", { simple: true });
    if (check !== "ok") throw new Error(`The restored database failed SQLite's integrity check: ${String(check)}`);
    return { objectKey: chosen, users: (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n };
  } finally {
    db.close();
  }
}
