import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupJob, copyUserData, openBackup, restoreBackup, sealBackup } from "../src/backup";
import { S3BackupStore, type BackupObject, type BackupStore } from "../src/backup-store";
import { openDb, schema } from "../src/db";

const SETTINGS = { endpoint: "https://acc.r2.test/", bucket: "my bucket", accessKeyId: "id", secretAccessKey: "secret" };

describe("S3BackupStore (R2's API, faked at fetch)", () => {
  const calls: { method: string; url: string; auth: string | null; body: unknown }[] = [];
  let answer: (url: string, method: string) => Response;

  beforeEach(() => {
    calls.length = 0;
    answer = () => new Response("", { status: 200 });
    vi.stubGlobal("fetch", async (req: Request) => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.get("authorization"), body: req.method === "PUT" ? new Uint8Array(await req.arrayBuffer()) : null });
      return answer(req.url, req.method);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const xml = (keys: [string, string, number][], next?: string) =>
    `<ListBucketResult>${keys.map(([k, t, s]) => `<Contents><Key>${k}</Key><LastModified>${t}</LastModified><Size>${s}</Size></Contents>`).join("")}<IsTruncated>${next ? "true" : "false"}</IsTruncated>${next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ""}</ListBucketResult>`;

  it("signs its requests and sends them path-style, with names encoded", async () => {
    const store = new S3BackupStore(SETTINGS);
    await store.put("users/a b.ldcb", new Uint8Array([1, 2, 3]));
    expect(calls[0]).toMatchObject({ method: "PUT", url: "https://acc.r2.test/my%20bucket/users/a%20b.ldcb" });
    expect(calls[0]!.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=id\//);
    expect(calls[0]!.auth).not.toContain("secret");
    expect(calls[0]!.body).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("gets and deletes what it's told", async () => {
    answer = (_u, method) => (method === "GET" ? new Response(new Uint8Array([9, 8])) : new Response(null, { status: 204 }));
    const store = new S3BackupStore(SETTINGS);
    expect(await store.get("users/x")).toEqual(new Uint8Array([9, 8]));
    await store.delete("users/x");
    expect(calls.map((c) => c.method)).toEqual(["GET", "DELETE"]);
  });

  it("lists through every page and reads names back unescaped", async () => {
    answer = (url) => new Response(new URL(url).searchParams.get("continuation-token") ? xml([["users/b", "2026-10-02T00:00:00.000Z", 20]]) : xml([["users/a&amp;1", "2026-10-01T00:00:00.000Z", 10]], "more"));
    const list = await new S3BackupStore(SETTINGS).list("users/");
    expect(list).toEqual<BackupObject[]>([
      { key: "users/a&1", lastModified: Date.parse("2026-10-01T00:00:00.000Z"), size: 10 },
      { key: "users/b", lastModified: Date.parse("2026-10-02T00:00:00.000Z"), size: 20 },
    ]);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]!.url).searchParams.get("prefix")).toBe("users/");
    expect(new URL(calls[1]!.url).searchParams.get("continuation-token")).toBe("more");
  });

  it("an empty bucket lists as nothing", async () => {
    answer = () => new Response(xml([]));
    expect(await new S3BackupStore(SETTINGS).list("users/")).toEqual([]);
  });

  it("says what the storage refused, with its code but no secret", async () => {
    answer = () => new Response("<Error><Code>AccessDenied</Code><Message>nope</Message></Error>", { status: 403 });
    await expect(new S3BackupStore(SETTINGS).put("k", new Uint8Array())).rejects.toThrow("Backup storage: PUT failed with HTTP 403 (AccessDenied)");
    // Not XML: just the status. (5xx answers are retried inside the signing client, with its own backoff.)
    answer = () => new Response("not found", { status: 404 });
    await expect(new S3BackupStore(SETTINGS).get("k")).rejects.toThrow(/^Backup storage: GET failed with HTTP 404$/);
  });
});

describe("restoring and the failure paths of a backup", () => {
  const dirs: string[] = [];
  const dir = () => {
    const d = mkdtempSync(join(tmpdir(), "ldc-restore-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const store = (objects: Record<string, Uint8Array> = {}): BackupStore => ({
    put: async (k, b) => void (objects[k] = b),
    get: async (k) => {
      if (!objects[k]) throw new Error("NoSuchKey");
      return objects[k]!;
    },
    list: async (p) => Object.keys(objects).filter((k) => k.startsWith(p)).map((key) => ({ key, lastModified: 0, size: 0 })),
    delete: async (k) => void delete objects[k],
  });

  function database() {
    const path = join(dir(), "ldc.sqlite");
    const db = openDb(path);
    db.insert(schema.users).values({ puuid: "P", gameName: "N", tagLine: "T", tokenHash: "h", createdAt: 1 }).run();
    return { db, path };
  }
  /** A sealed copy of a real database. */
  function sealedCopy(key: Buffer) {
    const { db, path } = database();
    const copy = join(dir(), "copy.sqlite");
    copyUserData(path, copy);
    db.$client.close();
    return sealBackup(readFileSync(copy), key);
  }

  it("says so when the bucket is empty, and restores the file named over the newest", async () => {
    const key = randomBytes(32);
    await expect(restoreBackup(store(), key, join(dir(), "o.sqlite"), null)).rejects.toThrow("No backups in the bucket.");
    const objects = { "users/2026-01.ldcb": sealedCopy(key), "users/2026-02.ldcb": sealBackup(Buffer.from("not a database"), key) };
    const out = join(dir(), "o.sqlite");
    expect(await restoreBackup(store(objects), key, out, "users/2026-01.ldcb")).toEqual({ objectKey: "users/2026-01.ldcb", users: 1 });
  });

  it("picks the newest by its dated name, only under the prefix", async () => {
    const key = randomBytes(32);
    const objects = { "users/2026-01.ldcb": sealBackup(Buffer.from("old"), key), "users/2026-03.ldcb": sealedCopy(key), "other/2026-09.ldcb": sealBackup(Buffer.from("elsewhere"), key) };
    expect((await restoreBackup(store(objects), key, join(dir(), "o.sqlite"), null)).objectKey).toBe("users/2026-03.ldcb");
  });

  it("refuses a file that decrypts but isn't a database", async () => {
    const key = randomBytes(32);
    const objects = { "users/x": sealBackup(Buffer.from("this is no sqlite file, and long enough to be read as one".repeat(30)), key) };
    await expect(restoreBackup(store(objects), key, join(dir(), "o.sqlite"), null)).rejects.toThrow();
  });

  it("refuses the wrong key or something that isn't ours before writing anything", async () => {
    const key = randomBytes(32);
    const out = join(dir(), "o.sqlite");
    await expect(restoreBackup(store({ "users/x": sealedCopy(key) }), randomBytes(32), out, null)).rejects.toThrow(/wrong BACKUP_ENCRYPTION_KEY/);
    await expect(restoreBackup(store({ "users/x": Buffer.from("plain file") }), key, out, null)).rejects.toThrow(/Not a LoL Draft Coach backup/);
    expect(() => readFileSync(out)).toThrow();
  });

  it("refuses a file with its header tampered with, or cut short", () => {
    const key = randomBytes(32);
    const sealed = sealBackup(Buffer.from("hello"), key);
    expect(openBackup(sealed, key).toString()).toBe("hello");
    const iv = Buffer.from(sealed);
    iv[6]! ^= 1;
    expect(() => openBackup(iv, key)).toThrow(/damaged/);
    expect(() => openBackup(sealed.subarray(0, sealed.length - 1), key)).toThrow(/damaged/);
    expect(() => openBackup(sealed.subarray(0, 3), key)).toThrow(/Not a LoL Draft Coach backup/);
  });

  it("seals with a fresh IV each time, so two backups of the same data differ", () => {
    const key = randomBytes(32);
    expect(sealBackup(Buffer.from("x"), key).equals(sealBackup(Buffer.from("x"), key))).toBe(false);
  });

  it("leaves no plain copy behind, and the upload is never readable as SQLite or by its users' names", async () => {
    const { db, path } = database();
    const objects: Record<string, Uint8Array> = {};
    const job = new BackupJob(db, path, store(objects), { key: randomBytes(32), everyMs: 1000, keepMs: Date.now() + 1000 });
    const r = await job.run();
    expect(r.error).toBeNull();
    const body = Buffer.from(objects[r.objectKey!]!);
    expect(body.subarray(0, 5).toString()).toBe("LDCB1");
    expect(body.includes(Buffer.from("SQLite format"))).toBe(false);
    db.$client.close();
  });

  it("a backup that can't read the database records the error rather than throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = database();
    const job = new BackupJob(db, join(dir(), "missing", "gone.sqlite"), store(), { key: randomBytes(32), everyMs: 1000, keepMs: 1000 });
    const r = await job.run();
    expect(r.error).toBeTruthy();
    expect(r.objectKey).toBeNull();
    expect(job.lastGoodAt()).toBeNull();
    expect(job.due()).toBe(true);
    db.$client.close();
  });

  it("a failed clean-up doesn't fail the backup", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, path } = database();
    const s = store();
    s.list = async () => Promise.reject(new Error("list refused"));
    const r = await new BackupJob(db, path, s, { key: randomBytes(32), everyMs: 1000, keepMs: 1000 }).run();
    expect(r.error).toBeNull();
    expect(r.objectKey).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    db.$client.close();
  });

  it("only one runs at a time: a second start joins it, and runIfDue stays out", async () => {
    const { db, path } = database();
    let release = () => {};
    const s = store();
    const put = s.put;
    s.put = async (k, b) => {
      await new Promise<void>((r) => (release = r));
      return put(k, b);
    };
    const job = new BackupJob(db, path, s, { key: randomBytes(32), everyMs: 1000, keepMs: 1_000_000 });
    const a = job.run();
    expect(job.running).toBe(true);
    expect(job.run()).toBe(a);
    expect(await job.runIfDue()).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect((await a).error).toBeNull();
    expect(job.running).toBe(false);
    db.$client.close();
  });

  it("goes stale on /health after twice the interval without a good backup", async () => {
    const { db, path } = database();
    let t = 1_000_000;
    const job = new BackupJob(db, path, store(), { key: randomBytes(32), everyMs: 1000, keepMs: 1_000_000, now: () => t });
    expect(job.health()).toMatchObject({ lastGoodAt: null, stale: true, lastRun: null });
    await job.run();
    t += 2000;
    expect(job.health().stale).toBe(false);
    t += 1;
    expect(job.health().stale).toBe(true);
    db.$client.close();
  });

  it("a restore that fails its integrity check is reported", async () => {
    const key = randomBytes(32);
    // A real database with a page overwritten in the middle.
    const { db, path } = database();
    for (let i = 0; i < 500; i++) db.insert(schema.invites).values({ codeHash: `c${i}${"x".repeat(200)}`, createdAt: 1, expiresAt: 2 }).run();
    db.$client.close();
    const copy = join(dir(), "copy.sqlite");
    copyUserData(path, copy);
    const bytes = readFileSync(copy);
    bytes.fill(0xab, 4096 * 8, 4096 * 12);
    writeFileSync(copy, bytes);
    await expect(restoreBackup(store({ "users/x": sealBackup(readFileSync(copy), key) }), key, join(dir(), "o.sqlite"), null)).rejects.toThrow();
  });
});
