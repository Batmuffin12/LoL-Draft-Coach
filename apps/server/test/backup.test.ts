import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { BackupJob, copyUserData, openBackup, restoreBackup, sealBackup } from "../src/backup";
import type { BackupObject, BackupStore } from "../src/backup-store";
import { openDb, schema, type Db } from "../src/db";
import { MIGRATIONS } from "../src/db/migrations";
import { backupSettings, readServerEnv, ServerEnvError } from "../src/env";

class MemoryStore implements BackupStore {
  objects = new Map<string, { body: Uint8Array; lastModified: number }>();
  constructor(private now: () => number) {}
  async put(key: string, body: Uint8Array) {
    this.objects.set(key, { body, lastModified: this.now() });
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error("NoSuchKey");
    return o.body;
  }
  async list(prefix: string): Promise<BackupObject[]> {
    return [...this.objects].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, lastModified: o.lastModified, size: o.body.length }));
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

const HOUR = 3_600_000;
const dirs: string[] = [];
const opened: Db[] = [];
/** openDb, closed after the test (Windows can't delete an open file). */
const open = (path: string) => {
  const db = openDb(path);
  opened.push(db);
  return db;
};
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "ldc-backup-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const db of opened.splice(0)) db.$client.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A database with one user and their irreplaceable rows, plus a game that must not be copied. */
function seeded(): { db: Db; path: string } {
  const path = join(tempDir(), "ldc.sqlite");
  const db = open(path);
  db.insert(schema.users).values({ puuid: "P", gameName: "Name", tagLine: "EUW", tokenHash: "hash", createdAt: 1, lastSyncAt: 5, historyBacklog: 0 }).run();
  db.insert(schema.invites).values({ codeHash: "code", createdAt: 1, expiresAt: 9, usedBy: 1, usedAt: 2 }).run();
  db.insert(schema.adviceLog).values({ userId: 1, gameId: 77, lockedAt: 3, championId: 950, advice: { shown: [] } as never, createdAt: 3 }).run();
  db.insert(schema.rankHistory).values({ userId: 1, day: "2026-10-11", queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "I" }).run();
  db.$client.prepare("INSERT INTO matches (match_id, queue_id, game_version, ended_at, duration_sec, summary, stored_at, source) VALUES ('EUW1_1', 420, '16.20', 1, 1800, '{}', 1, 'collector')").run();
  return { db, path };
}

describe("backup copy", () => {
  it("keeps users, invites, advice and rank history, drops games, and opens as a working database", () => {
    const { path } = seeded();
    const copy = join(tempDir(), "copy.sqlite");
    expect(copyUserData(path, copy)).toEqual({ users: 1 });
    const db = open(copy); // no migration runs again: schema_migrations came along
    expect(db.$client.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()).toEqual({ n: MIGRATIONS.length });
    expect(db.select().from(schema.users).all()).toMatchObject([{ id: 1, tokenHash: "hash", lastSyncAt: null, historyBacklog: null }]);
    expect(db.select().from(schema.invites).all()).toHaveLength(1);
    expect(db.select().from(schema.adviceLog).all()).toHaveLength(1);
    expect(db.select().from(schema.rankHistory).all()).toHaveLength(1);
    expect(db.$client.prepare("SELECT COUNT(*) AS n FROM matches").get()).toEqual({ n: 0 });
    // A new user after a restore gets a fresh id.
    db.insert(schema.users).values({ puuid: "Q", gameName: "B", tagLine: "EUW", tokenHash: "h2", createdAt: 2 }).run();
    expect(db.select({ id: schema.users.id }).from(schema.users).all().map((u) => u.id).sort()).toEqual([1, 2]);
  });
});

describe("backup encryption", () => {
  it("round-trips and refuses a wrong key or a damaged file", () => {
    const key = randomBytes(32);
    const plain = Buffer.from("SQLite format 3 ... rows");
    const sealed = sealBackup(plain, key);
    expect(sealed.includes(plain)).toBe(false);
    expect(openBackup(sealed, key)).toEqual(plain);
    expect(() => openBackup(sealed, randomBytes(32))).toThrow(/wrong BACKUP_ENCRYPTION_KEY/);
    const damaged = Buffer.from(sealed);
    damaged[damaged.length - 1]! ^= 1;
    expect(() => openBackup(damaged, key)).toThrow(/damaged/);
  });
});

describe("BackupJob", () => {
  it("backs up once a day, deletes old copies, and restores the newest", async () => {
    const { db, path } = seeded();
    let t = Date.UTC(2026, 9, 11, 7, 7);
    const now = () => t;
    const store = new MemoryStore(now);
    const key = randomBytes(32);
    const job = new BackupJob(db, path, store, { key, everyMs: 24 * HOUR, keepMs: 30 * 24 * HOUR, now });

    expect(job.due()).toBe(true);
    const first = await job.run();
    expect(first).toMatchObject({ error: null, users: 1, objectKey: "users/2026-10-11T07-07-00-000Z.ldcb" });
    expect(await job.runIfDue()).toBeNull(); // done for today

    t += 23 * HOUR + 40 * 60_000; // the next day's wake-up, a little early, still counts
    expect(job.due()).toBe(true);
    for (let day = 0; day < 31; day++) {
      await job.runIfDue();
      t += 24 * HOUR;
    }
    // Kept: the last 30 days only.
    const kept = await store.list("users/");
    expect(kept.length).toBeLessThanOrEqual(31);
    expect(kept.every((o) => o.lastModified >= t - 24 * HOUR - 30 * 24 * HOUR)).toBe(true);
    expect(store.objects.has(first.objectKey!)).toBe(false);

    const out = join(tempDir(), "restored.sqlite");
    const r = await restoreBackup(store, key, out, null);
    expect(r.users).toBe(1);
    expect(r.objectKey).toBe(kept.map((o) => o.key).sort().at(-1));
    expect(job.health()).toMatchObject({ stale: false, lastRun: { users: 1, error: null } });
  });

  it("records a failed upload, retries at the next wake-up, and reports it in /health", async () => {
    const { db, path } = seeded();
    let t = 1_000 * HOUR;
    const store = new MemoryStore(() => t);
    store.put = async () => {
      throw new Error("Backup storage: PUT failed with HTTP 403 (AccessDenied)");
    };
    const job = new BackupJob(db, path, store, { key: randomBytes(32), everyMs: 24 * HOUR, keepMs: 30 * 24 * HOUR, now: () => t });
    expect((await job.run()).error).toMatch(/AccessDenied/);
    t += HOUR;
    expect(job.due()).toBe(true);

    const app = createApp({ db, version: "test", riot: null, backup: job });
    const health = (await (await app.request("/health")).json()) as { backup: ReturnType<BackupJob["health"]> };
    expect(health.backup).toMatchObject({ lastGoodAt: null, stale: true, lastRun: { error: expect.stringMatching(/AccessDenied/) } });
    expect(((await (await createApp({ db, version: "test", riot: null }).request("/health")).json()) as { backup: unknown }).backup).toBeNull();
  });
});

describe("backup settings", () => {
  const all = {
    BACKUP_S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
    BACKUP_S3_BUCKET: "ldc-backups",
    BACKUP_S3_ACCESS_KEY_ID: "id",
    BACKUP_S3_SECRET_ACCESS_KEY: "secret",
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
  it("are off when none is set, complete when all are, and an error when half set", () => {
    expect(backupSettings(readServerEnv({}))).toBeNull();
    expect(backupSettings(readServerEnv(all))).toMatchObject({ everyMs: 24 * HOUR, keepMs: 30 * 24 * HOUR, s3: { bucket: "ldc-backups" } });
    expect(() => backupSettings(readServerEnv({ ...all, BACKUP_S3_SECRET_ACCESS_KEY: "" }))).toThrow(ServerEnvError);
    expect(() => backupSettings(readServerEnv({ ...all, BACKUP_S3_SECRET_ACCESS_KEY: "" }))).toThrow(/BACKUP_S3_SECRET_ACCESS_KEY/);
    expect(() => readServerEnv({ ...all, BACKUP_ENCRYPTION_KEY: "c2hvcnQ=" })).toThrow(/32 random bytes/);
  });
});
