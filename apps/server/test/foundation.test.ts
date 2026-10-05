import { describe, expect, it } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb, schema } from "../src/db";
import { migrate, MIGRATIONS } from "../src/db/migrations";
import { readServerEnv, ServerEnvError } from "../src/env";

describe("server env", () => {
  it("applies defaults for a blank environment", () => {
    const env = readServerEnv({});
    expect(env).toMatchObject({ PORT: 8787, RIOT_KEY_TYPE: "development", RIOT_PLATFORM: "euw1", RIOT_REGION: "europe" });
    expect(env.RIOT_API_KEY).toBeUndefined();
    expect(env.ADMIN_TOKEN).toBeUndefined();
  });

  it("treats blank values as unset and rejects bad routing values with a clear error", () => {
    expect(readServerEnv({ RIOT_API_KEY: "  ", PORT: "" }).RIOT_API_KEY).toBeUndefined();
    expect(() => readServerEnv({ RIOT_PLATFORM: "EUW 1" })).toThrow(ServerEnvError);
    expect(() => readServerEnv({ RIOT_PLATFORM: "EUW 1" })).toThrow(/RIOT_PLATFORM/);
    expect(() => readServerEnv({ ADMIN_TOKEN: "short" })).toThrow(/ADMIN_TOKEN/);
  });
});

describe("migrations", () => {
  it("apply once and are skipped afterwards", () => {
    const sqlite = new BetterSqlite3(":memory:");
    expect(migrate(sqlite)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(migrate(sqlite)).toEqual([]);
  });

  it("roll back a failing migration completely", () => {
    const sqlite = new BetterSqlite3(":memory:");
    const bad = [{ version: 1, name: "bad", sql: "CREATE TABLE a (x INTEGER); NOT VALID SQL;" }];
    expect(() => migrate(sqlite, bad)).toThrow();
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'a'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()).toEqual({ n: 0 });
  });

  it("match the Drizzle schema (every Drizzle column exists in the migrated tables)", () => {
    const db = openDb(":memory:");
    for (const table of [schema.users, schema.invites, schema.matches, schema.userMatches, schema.userMasteries]) {
      const name = (table as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]!;
      const cols = (db.$client.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name);
      for (const col of Object.values(table) as { name?: string }[]) {
        if (typeof col?.name === "string") expect(cols, `${name}.${col.name}`).toContain(col.name);
      }
    }
  });

  it("let Drizzle write and read a user", () => {
    const db = openDb(":memory:");
    db.insert(schema.users).values({ puuid: "P", gameName: "Name", tagLine: "EUW", tokenHash: "h", createdAt: 1 }).run();
    expect(db.select().from(schema.users).all()).toMatchObject([{ id: 1, puuid: "P", band: null }]);
  });
});

describe("GET /health", () => {
  it("reports ok with the version and database state", async () => {
    const app = createApp({ db: openDb(":memory:"), version: "test", riot: null });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "test", database: "ok", riotKey: false, patch: null, newestMatchAt: null });
  });

  it("reports degraded when the database is closed", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, version: "test", riot: null });
    db.$client.close();
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "degraded", database: "error" });
  });

  it("answers unknown routes with JSON 404", async () => {
    const res = await createApp({ db: openDb(":memory:"), version: "test", riot: null }).request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
