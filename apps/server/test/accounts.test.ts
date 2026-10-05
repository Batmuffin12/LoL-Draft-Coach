import { describe, expect, it } from "vitest";
import { RiotApiError, RiotKeyError } from "@ldc/riot-api";
import { AccountError, createInvite, parseRiotId, registerUser, type AccountLookup } from "../src/accounts";
import { bearerToken, newInviteCode, normalizeInviteCode, sha256 } from "../src/auth";
import { createApp } from "../src/app";
import { openDb, schema } from "../src/db";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

/** Fake Account-V1: knows "Ofek#EUW" and "Friend#EUW". */
function fakeRiot(overrides: Partial<{ fail: Error }> = {}): AccountLookup & { calls: string[] } {
  const known: Record<string, string> = { "ofek#euw": "PUUID-OFEK", "friend#euw": "PUUID-FRIEND" };
  const calls: string[] = [];
  return {
    calls,
    async accountByRiotId(gameName: string, tagLine: string) {
      calls.push(`${gameName}#${tagLine}`);
      if (overrides.fail) throw overrides.fail;
      const puuid = known[`${gameName}#${tagLine}`.toLowerCase()];
      return puuid ? { puuid, gameName, tagLine } : null;
    },
  };
}

function setup(riot: AccountLookup | null = fakeRiot(), now = () => NOW) {
  const db = openDb(":memory:");
  const app = createApp({ db, version: "test", riot, now, registerPerMinute: 100 });
  const invite = (ttlDays = 14) => createInvite(db, { ttlDays, now: now() }).code;
  const register = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/users", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  const me = (token: string | null, method = "GET") =>
    app.request("/me", { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { db, app, invite, register, me };
}

describe("auth helpers", () => {
  it("makes readable invite codes and normalises what people type", () => {
    const code = newInviteCode();
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(code).not.toMatch(/[ILOU]/);
    expect(normalizeInviteCode(` ${code.toLowerCase().replaceAll("-", " ")} `)).toBe(code.replaceAll("-", ""));
  });

  it("reads bearer tokens", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer   abc ")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });

  it("parses Riot IDs on the last #", () => {
    expect(parseRiotId("Some Name#EUW")).toEqual({ gameName: "Some Name", tagLine: "EUW" });
    expect(parseRiotId("a#b#TAG")).toEqual({ gameName: "a#b", tagLine: "TAG" });
    for (const bad of ["NoTag", "#EUW", "Name#", "Name# "]) expect(() => parseRiotId(bad)).toThrow(AccountError);
  });
});

describe("registration", () => {
  it("registers with an invite and returns a token; only hashes are stored", async () => {
    const { db, invite, register } = setup();
    const code = invite();
    const res = await register({ inviteCode: code, riotId: "Ofek#EUW" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(body.token).toMatch(/^ldc_/);
    expect(body.user).toEqual({ id: 1, riotId: "Ofek#EUW", band: null, createdAt: NOW, lastSyncAt: null });
    expect(JSON.stringify(body)).not.toContain("PUUID");

    const [user] = db.select().from(schema.users).all();
    expect(user?.tokenHash).toBe(sha256(body.token));
    const [inv] = db.select().from(schema.invites).all();
    expect(inv).toMatchObject({ usedBy: 1, usedAt: NOW });
    expect(JSON.stringify(db.select().from(schema.invites).all())).not.toContain(code);
  });

  it("accepts the code in lower case with spaces", async () => {
    const { invite, register } = setup();
    const code = invite().toLowerCase().replaceAll("-", " ");
    expect((await register({ inviteCode: code, riotId: "Ofek#EUW" })).status).toBe(201);
  });

  it("refuses used, expired and unknown invites", async () => {
    let now = NOW;
    const { invite, register } = setup(fakeRiot(), () => now);
    const code = invite(1);
    expect((await register({ inviteCode: code, riotId: "Ofek#EUW" })).status).toBe(201);
    const reused = await register({ inviteCode: code, riotId: "Friend#EUW" });
    expect(reused.status).toBe(403);
    expect(await reused.json()).toMatchObject({ error: "invite_invalid" });

    const expiring = invite(1);
    now += 2 * DAY;
    expect((await register({ inviteCode: expiring, riotId: "Friend#EUW" })).status).toBe(403);
    expect((await register({ inviteCode: "AAAA-BBBB-CCCC", riotId: "Friend#EUW" })).status).toBe(403);
  });

  it("checks the invite before calling Riot, and keeps the invite when the Riot ID is unknown", async () => {
    const riot = fakeRiot();
    const { db, invite, register } = setup(riot);
    expect((await register({ inviteCode: "AAAA-BBBB-CCCC", riotId: "Ofek#EUW" })).status).toBe(403);
    expect(riot.calls).toEqual([]);

    const code = invite();
    const res = await register({ inviteCode: code, riotId: "Nobody#EUW" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "riot_id_not_found" });
    expect(db.select().from(schema.invites).all()[0]?.usedAt).toBeNull();
    expect((await register({ inviteCode: code, riotId: "Ofek#EUW" })).status).toBe(201);
  });

  it("re-registering the same account replaces its token", async () => {
    const { invite, register, me } = setup();
    const first = (await (await register({ inviteCode: invite(), riotId: "Ofek#EUW" })).json()) as { token: string };
    const second = (await (await register({ inviteCode: invite(), riotId: "ofek#euw" })).json()) as { token: string; user: { id: number } };
    expect(second.user.id).toBe(1);
    expect((await me(first.token)).status).toBe(401);
    expect((await me(second.token)).status).toBe(200);
  });

  it("validates the body and the Riot ID", async () => {
    const { invite, register } = setup();
    expect((await register({ riotId: "Ofek#EUW" })).status).toBe(400);
    const bad = await register({ inviteCode: invite(), riotId: "OfekEUW" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid_riot_id" });
  });

  it("answers 503 without a Riot key or when Riot rejects the key, 502 on other Riot errors", async () => {
    const noKey = setup(null);
    expect((await noKey.register({ inviteCode: noKey.invite(), riotId: "Ofek#EUW" })).status).toBe(503);
    const rejected = setup(fakeRiot({ fail: new RiotKeyError(403, "account") }));
    expect((await rejected.register({ inviteCode: rejected.invite(), riotId: "Ofek#EUW" })).status).toBe(503);
    const flaky = setup(fakeRiot({ fail: new RiotApiError(500, "account") }));
    expect((await flaky.register({ inviteCode: flaky.invite(), riotId: "Ofek#EUW" })).status).toBe(502);
  });

  it("rate-limits registration attempts per client", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, version: "test", riot: fakeRiot(), now: () => NOW, registerPerMinute: 2 });
    const post = (ip: string) =>
      app.request("/users", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-forwarded-for": ip } });
    expect((await post("1.1.1.1")).status).toBe(400);
    expect((await post("1.1.1.1")).status).toBe(400);
    expect((await post("1.1.1.1")).status).toBe(429);
    expect((await post("2.2.2.2")).status).toBe(400);
  });

  it("lets only one of two racing registrations use an invite", async () => {
    const db = openDb(":memory:");
    const code = createInvite(db, { ttlDays: 1, now: NOW }).code;
    const results = await Promise.allSettled([
      registerUser(db, fakeRiot(), { inviteCode: code, riotId: "Ofek#EUW" }, NOW),
      registerUser(db, fakeRiot(), { inviteCode: code, riotId: "Friend#EUW" }, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(db.select().from(schema.users).all()).toHaveLength(1);
  });
});

describe("/me", () => {
  it("needs a valid token", async () => {
    const { me } = setup();
    expect((await me(null)).status).toBe(401);
    expect((await me("ldc_wrong")).status).toBe(401);
  });

  it("shows the user and deletes all their data", async () => {
    const { db, invite, register, me } = setup();
    const { token } = (await (await register({ inviteCode: invite(), riotId: "Ofek#EUW" })).json()) as { token: string };
    expect(await (await me(token)).json()).toMatchObject({ user: { riotId: "Ofek#EUW" } });

    expect((await me(token, "DELETE")).status).toBe(204);
    expect(db.select().from(schema.users).all()).toEqual([]);
    expect(db.select().from(schema.invites).all()[0]?.usedBy).toBeNull();
    expect((await me(token)).status).toBe(401);
  });
});
