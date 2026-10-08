import { describe, expect, it } from "vitest";
import { MatchSchema } from "@ldc/riot-api";
import { createApp } from "../src/app";
import { createInvite } from "../src/accounts";
import { openDb } from "../src/db";
import { findConfigDir, loadServerConfig } from "../src/config";
import { SyncScheduler } from "../src/sync-scheduler";
import type { SyncRiot } from "../src/sync";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const bands = loadServerConfig(findConfigDir(process.cwd())).bands;

function rawMatch(id: string, puuids: string[], endedAt: number) {
  return MatchSchema.parse({
    metadata: { matchId: id },
    info: {
      gameCreation: endedAt - 1_800_000,
      gameDuration: 1800,
      gameEndTimestamp: endedAt,
      queueId: 420,
      participants: Array.from({ length: 10 }, (_, i) => ({ puuid: puuids[i] ?? `X${i}`, championId: 100 + i, teamId: i < 5 ? 100 : 200, win: i < 5 })),
    },
  });
}

/** Ofek (PO) played EUW1_3 and EUW1_2; Friend (PF) played EUW1_2 (as participant 4) and EUW1_1. */
function fakeRiot(): SyncRiot {
  const store = new Map([
    ["EUW1_3", rawMatch("EUW1_3", ["PO"], NOW - 1 * HOUR)],
    ["EUW1_2", rawMatch("EUW1_2", ["PO", "a", "b", "c", "PF"], NOW - 2 * HOUR)],
    ["EUW1_1", rawMatch("EUW1_1", ["PF"], NOW - 3 * HOUR)],
  ]);
  const ids: Record<string, string[]> = { PO: ["EUW1_3", "EUW1_2"], PF: ["EUW1_2", "EUW1_1"] };
  return {
    accountByRiotId: async () => null,
    masteriesByPuuid: async () => [{ championId: 100, championLevel: 5, championPoints: 30_000 }],
    leagueEntriesByPuuid: async () => [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD" }],
    matchIdsByPuuid: async (puuid, q = {}) => (ids[puuid] ?? []).slice(q.start ?? 0, (q.start ?? 0) + (q.count ?? 20)),
    match: async (id) => store.get(id) ?? null,
  };
}

function setup() {
  const db = openDb(":memory:");
  const riot = fakeRiot();
  const account = { accountByRiotId: async (gameName: string, tagLine: string) => ({ puuid: gameName === "Ofek" ? "PO" : "PF", gameName, tagLine }) };
  const sync = new SyncScheduler(db, riot, { history: { matchCount: 10, queues: [420], timelineCount: 0 }, bands }, {
    tickMs: 1e9, staleAfterMs: 1, activeWithinMs: 1e9, now: () => NOW, log: () => {},
  });
  const app = createApp({ db, version: "test", riot: account, sync, now: () => NOW, registerPerMinute: 100 });
  const register = async (riotId: string) => {
    const code = createInvite(db, { ttlDays: 1, now: NOW }).code;
    const res = await app.request("/users", { method: "POST", body: JSON.stringify({ inviteCode: code, riotId }), headers: { "content-type": "application/json" } });
    const body = (await res.json()) as { token: string; user: { id: number } };
    await sync.request(body.user.id); // joins the sync registration started
    return body.token;
  };
  const get = (path: string, token: string, method = "GET") => app.request(path, { method, headers: { authorization: `Bearer ${token}` } });
  return { app, sync, register, get };
}

describe("GET /me/profile", () => {
  it("returns the user's own matches newest first, with their index, mastery and rank", async () => {
    const { register, get } = setup();
    const token = await register("Ofek#EUW");
    const res = await get("/me/profile", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.user).toMatchObject({ riotId: "Ofek#EUW", band: 2, lastSyncAt: NOW });
    expect(body.ranked).toEqual([{ queueType: "RANKED_SOLO_5x5", tier: "GOLD" }]);
    expect(body.masteries).toEqual([{ championId: 100, level: 5, points: 30_000 }]);
    expect(body.matches.map((m: any) => [m.match.matchId, m.me])).toEqual([["EUW1_3", 0], ["EUW1_2", 0]]);
    expect(body.matchIds).toEqual(["EUW1_3", "EUW1_2"]);
    expect(body.sync).toMatchObject({ state: "done", result: { totalMatches: 2 } });
  });

  it("never shows another user's matches, and gives each friend their own index in a shared game", async () => {
    const { register, get } = setup();
    await register("Ofek#EUW");
    const friend = await register("Friend#EUW");
    const body = (await (await get("/me/profile", friend)).json()) as { matches: { match: { matchId: string }; me: number }[] };
    expect(body.matches.map((m) => [m.match.matchId, m.me])).toEqual([["EUW1_2", 4], ["EUW1_1", 0]]);
  });

  it("returns only newer matches with ?since, but every current id", async () => {
    const { register, get } = setup();
    const token = await register("Ofek#EUW");
    const body = (await (await get(`/me/profile?since=${NOW - 90 * 60_000}`, token)).json()) as { matches: unknown[]; matchIds: string[] };
    expect(body.matches).toHaveLength(1);
    expect(body.matchIds).toEqual(["EUW1_3", "EUW1_2"]);
    expect((await get("/me/profile?since=yesterday", token)).status).toBe(400);
  });

  it("is compressed when the client accepts gzip", async () => {
    const { app, register } = setup();
    const token = await register("Ofek#EUW");
    const res = await app.request("/me/profile", { headers: { authorization: `Bearer ${token}`, "accept-encoding": "gzip" } });
    expect(res.headers.get("content-encoding")).toBe("gzip");
  });

  it("needs a token", async () => {
    const { app } = setup();
    expect((await app.request("/me/profile")).status).toBe(401);
  });
});

describe("/me/sync", () => {
  it("starts a sync and reports its state", async () => {
    const { register, get, sync } = setup();
    const token = await register("Ofek#EUW");
    const res = await get("/me/sync", token, "POST");
    expect(res.status).toBe(202);
    expect(((await res.json()) as { sync: { state: string } }).sync.state).toBe("running");
    await sync.request(1);
    expect(await (await get("/me/sync", token)).json()).toMatchObject({ sync: { state: "done", result: { newMatches: 0, totalMatches: 2 } } });
  });

  it("answers 503 when the server has no Riot key", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, version: "test", riot: null, sync: null });
    db.$client.prepare("INSERT INTO users (puuid, game_name, tag_line, token_hash, created_at) VALUES ('P','a','b',?,1)").run(
      (await import("../src/auth")).sha256("ldc_t"),
    );
    expect((await app.request("/me/sync", { method: "POST", headers: { authorization: "Bearer ldc_t" } })).status).toBe(503);
  });
});

describe("sync on demand (no background timer)", () => {
  it("starts a sync when the profile is fetched and the games are stale, not when fresh", async () => {
    const db = openDb(":memory:");
    let now = NOW;
    const requests: number[] = [];
    const sync = { request: async (id: number) => (requests.push(id), { newMatches: 0, totalMatches: 0, band: 2, remaining: 0 }), state: () => ({ state: "idle" as const }), forget: () => {} };
    const account = { accountByRiotId: async (gameName: string, tagLine: string) => ({ puuid: "PO", gameName, tagLine }) };
    const app = createApp({ db, version: "test", riot: account, sync, syncWhenStaleMs: 30 * 60_000, now: () => now, registerPerMinute: 100 });
    const code = createInvite(db, { ttlDays: 1, now: NOW }).code;
    const { token } = (await (await app.request("/users", { method: "POST", body: JSON.stringify({ inviteCode: code, riotId: "Ofek#EUW" }), headers: { "content-type": "application/json" } })).json()) as { token: string };
    requests.length = 0; // registration itself requests the first sync
    const get = () => app.request("/me/profile", { headers: { authorization: `Bearer ${token}` } });

    await get(); // never synced
    expect(requests).toEqual([1]);
    db.$client.prepare("UPDATE users SET last_sync_at = ?").run(NOW);
    now = NOW + 10 * 60_000;
    await get(); // fresh
    expect(requests).toEqual([1]);
    now = NOW + 31 * 60_000;
    await get(); // stale
    expect(requests).toEqual([1, 1]);
  });
});

describe("POST /advice (advice log)", () => {
  const advice = (gameId: number, pick = 103, lockedAt = NOW - HOUR) => ({
    gameId,
    queueId: 420,
    role: "middle",
    band: 2,
    lockedAt,
    pick: { championId: pick, expectedWin: 0.54, terms: [{ name: "lane", rating: 0.08, deltaWin: 0.021, games: 1240 }] },
    shown: [{ championId: 103, expectedWin: 0.54, terms: [] }, { championId: 245, expectedWin: 0.52, terms: [] }],
  });
  const post = (app: ReturnType<typeof setup>["app"], token: string, body: unknown) =>
    app.request("/advice", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });

  it("stores your advice per game (a repeat replaces it) and returns it with your profile, newest first", async () => {
    const { app, register, get } = setup();
    const token = await register("Ofek#EUW");
    expect((await post(app, token, advice(3, 103, NOW - 2 * HOUR))).status).toBe(204);
    expect((await post(app, token, advice(4, 99, NOW - HOUR))).status).toBe(204);
    expect((await post(app, token, advice(3, 245, NOW - 2 * HOUR))).status).toBe(204);
    const body = (await (await get("/me/profile", token)).json()) as { advice: { gameId: number; pick: { championId: number } }[] };
    expect(body.advice.map((a) => [a.gameId, a.pick.championId])).toEqual([[4, 99], [3, 245]]);
  });

  it("keeps each player's advice to themselves and deletes it with DELETE /me", async () => {
    const { app, register, get } = setup();
    const ofek = await register("Ofek#EUW");
    const friend = await register("Friend#EUW");
    await post(app, ofek, advice(3));
    expect(((await (await get("/me/profile", friend)).json()) as { advice: unknown[] }).advice).toEqual([]);
    expect((await get("/me", ofek, "DELETE")).status).toBe(204);
    expect((await post(app, ofek, advice(3))).status).toBe(401);
  });

  it("rejects bodies that aren't one advice record, and requests without a token", async () => {
    const { app, register } = setup();
    const token = await register("Ofek#EUW");
    expect((await post(app, token, { gameId: 3 })).status).toBe(400);
    expect((await post(app, token, { ...advice(3), shown: Array.from({ length: 11 }, () => advice(3).pick) })).status).toBe(400);
    const res = await app.request("/advice", { method: "POST", body: JSON.stringify(advice(3)), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(401);
  });
});

describe("rank history", () => {
  it("keeps your rank per day from each sync and returns it with your profile", async () => {
    const { register, get } = setup();
    const token = await register("Ofek#EUW");
    const body = (await (await get("/me/profile", token)).json()) as { rankHistory: unknown[] };
    expect(body.rankHistory).toEqual([{ day: new Date(NOW).toISOString().slice(0, 10), queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: null }]);
  });
});
