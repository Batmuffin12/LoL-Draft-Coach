import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { RiotApi, type Match } from "@ldc/riot-api";
import { findConfigDir, loadConfig } from "../src/main/config";
import { MatchStore, minimizeMatch } from "../src/main/match-store";
import { PersonalCoach } from "../src/main/personal-coach";
import { DirectProfileSource } from "../src/main/profile-source";
import { loadProfile, MATCH_IDS_PAGE, sortMatchIdsNewestFirst } from "../src/main/profile";
import type { ViewState } from "../src/shared/view";
import { CLIENT_PUUID, fakeDdragonFetch, fakeRiotFetch, LOCAL_PUUID, waitFor } from "./helpers";

const config = loadConfig(findConfigDir(__dirname));
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const riotWith = (fetchFn: typeof fetch) =>
  new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fetchFn });

describe("config loading", () => {
  it("finds and validates the repo config", () => {
    expect(config.app.history.matchCount).toBeGreaterThan(0);
    expect(config.bands.bands.length).toBeGreaterThan(0);
  });
});

describe("match store", () => {
  it("keeps no identifiers when minimising a match", async () => {
    const riot = riotWith(fakeRiotFetch().fetchFn);
    const match = (await riot.match("EUW1_1000")) as Match;
    const stored = minimizeMatch(match, LOCAL_PUUID);
    expect(stored.me).toMatchObject({ championId: 103, position: "middle" });
    expect(stored.samples).toHaveLength(10);
    expect(JSON.stringify(stored)).not.toMatch(/puuid|other-|name-|mock-local/);
  });

  it("sorts match ids newest first and de-duplicates", () => {
    expect(sortMatchIdsNewestFirst(["EUW1_5", "EUW1_100", "EUW1_5", "EUW1_20"])).toEqual(["EUW1_100", "EUW1_20", "EUW1_5"]);
  });

  it("pages through match ids beyond Riot's per-call limit", async () => {
    const many: [number, string, boolean][] = Array.from({ length: 130 }, (_, i) => [103, "MIDDLE", i % 2 === 0]);
    const fake = fakeRiotFetch({ myChamps: many });
    const p = await loadProfile({
      riot: riotWith(fake.fetchFn),
      puuid: LOCAL_PUUID,
      history: { matchCount: 120, queues: [420] },
      store: new MatchStore(tmp("ldc-pg-"), LOCAL_PUUID),
    });
    expect(p.games).toHaveLength(120);
    expect(fake.calls.filter((c) => c.endsWith("/ids"))).toHaveLength(2);
    expect(MATCH_IDS_PAGE).toBe(100);
    expect(p.masteries[0]).toMatchObject({ championId: 103, grades: ["S", "A+"] });
  });

  it("loads the profile once and serves it from the cache afterwards", async () => {
    const root = tmp("ldc-m-");
    const fake = fakeRiotFetch();
    const progress: number[] = [];
    const p = await loadProfile({
      riot: riotWith(fake.fetchFn),
      puuid: LOCAL_PUUID,
      history: config.app.history,
      store: new MatchStore(root, LOCAL_PUUID),
      onProgress: (done) => progress.push(done),
    });
    expect(p.games).toHaveLength(23);
    expect(p.masteries[0]?.championId).toBe(103);
    expect(progress.at(-1)).toBe(23);
    // Folder named by hash, not by PUUID.
    expect(readdirSync(root)[0]).not.toContain(LOCAL_PUUID);

    const again = fakeRiotFetch();
    await loadProfile({ riot: riotWith(again.fetchFn), puuid: LOCAL_PUUID, history: config.app.history, store: new MatchStore(root, LOCAL_PUUID) });
    expect(again.calls.filter((c) => /\/matches\/EUW1_\d+$/.test(c))).toHaveLength(0);
  });
});

let server: MockLcuServer | null = null;
let coach: PersonalCoach | null = null;
afterEach(async () => {
  coach?.stop();
  await server?.stop();
  server = null;
  coach = null;
});

async function startCoach(riot: RiotApi | null, overrides: Record<string, unknown> = {}, riotId: string | null = null) {
  server = new MockLcuServer(loadFixture("synthetic-draft-pick"), {
    // Like the real client: its PUUID is not usable with the Riot API.
    "/lol-summoner/v1/current-summoner": { puuid: CLIENT_PUUID, gameName: "Me", tagLine: "EUW" },
    "/lol-ranked/v1/current-ranked-stats": { queues: [{ queueType: "RANKED_SOLO_5x5", tier: "EMERALD", division: "IV" }] },
    ...overrides,
  });
  const creds = await server.start();
  const matchesDir = tmp("ldc-pc-");
  const profiles = riot
    ? new DirectProfileSource({ riot, history: config.app.history, bands: config.bands, storeFor: (puuid) => new MatchStore(matchesDir, puuid) })
    : null;
  coach = new PersonalCoach({
    connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
    ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }),
    config,
    profiles,
    noProfileMessage: "No Riot API key configured. Set RIOT_API_KEY in your .env to get personal picks.",
    riotId,
  });
  const states: ViewState[] = [];
  coach.on("state", (s) => states.push(s));
  await coach.start();
  return states;
}

describe("PersonalCoach (mock client + fake Riot API)", () => {
  it("recommends the top picks from the player's own pool during their turn", async () => {
    const states = await startCoach(riotWith(fakeRiotFetch().fetchFn));
    await waitFor(() => coach!.state.status.profile.state === "ready" && server!.clientCount === 1);
    expect(coach!.state.status.band).toBe(3); // EMERALD from the client's ranked stats, via config

    while (coach!.state.draft?.localAction !== "pick" && server!.step()) await new Promise((r) => setTimeout(r, 15));
    await waitFor(() => coach!.state.picks.length > 0);

    const picks = coach!.state.picks;
    expect(picks).toHaveLength(config.engine.topN);
    const ids = picks.map((p) => p.champion.id);
    // Own mid pool, minus 238 (banned in the fixture); never the bottom-lane champion.
    expect(ids).not.toContain(238);
    expect(ids).not.toContain(51);
    expect(ids.every((id) => [103, 245, 84].includes(id))).toBe(true);
    expect(coach!.state.pickRole).toBe("middle");
    expect(picks[0]!.champion.name).toBe("Ahri");
    expect(picks[0]!.reasons.join(" ")).toMatch(/win rate/);
    // Riot's positions come from the client (fixture): Ahri/Ekko/Akali are all listed for middle.
    expect(picks.every((p) => !p.offMeta)).toBe(true);
    expect(picks.find((p) => p.champion.id === 103)!.reasons.join(" ")).toMatch(/grades S A+/);

    // Lobby role advice from the same history: middle (19 games) first, bottom (4) after.
    const roles = coach!.state.roles;
    expect(roles[0]).toMatchObject({ role: "middle", games: 19, enoughData: true });
    expect(roles[0]!.champions.map((c) => c.name)).toContain("Ahri");
    expect(roles.find((r) => r.role === "bottom")?.enoughData).toBe(false);

    // Compliance: nothing identity-like ever reaches the panel.
    expect(JSON.stringify(states)).not.toMatch(/puuid|mock-local|other-|name-|gameName|tagLine/i);
  });

  it("resolves the account through Account-V1 and never sends the client's PUUID to Riot", async () => {
    const fake = fakeRiotFetch();
    await startCoach(riotWith(fake.fetchFn));
    await waitFor(() => coach!.state.status.profile.state === "ready");
    expect(fake.calls.some((c) => c.includes("/accounts/by-riot-id/Me/EUW"))).toBe(true);
    expect(fake.calls.some((c) => c.includes(CLIENT_PUUID))).toBe(false);
  });

  it("falls back to RIOT_ID when the client reports no account (mock client / demo)", async () => {
    const fake = fakeRiotFetch();
    await startCoach(riotWith(fake.fetchFn), { "/lol-summoner/v1/current-summoner": null, "/lol-ranked/v1/current-ranked-stats": null }, "Me#EUW");
    await waitFor(() => coach!.state.status.profile.state === "ready");
    expect(fake.calls.some((c) => c.includes("/accounts/by-riot-id/Me/EUW"))).toBe(true);
    expect(coach!.state.status.band).toBe(2); // from League-V4 (PLATINUM) since the client has no ranked data
  });

  it("shows a clear renew-your-key message when the development key has expired", async () => {
    await startCoach(riotWith(fakeRiotFetch({ expiredKey: true }).fetchFn));
    await waitFor(() => coach!.state.status.profile.state === "error");
    const profile = coach!.state.status.profile;
    expect(profile.state === "error" && profile.message).toMatch(/expire every 24 hours/);
    // The live draft still works without Riot API access.
    await waitFor(() => coach!.state.draft !== null);
  });

  it("explains a missing API key", async () => {
    await startCoach(null);
    const profile = coach!.state.status.profile;
    expect(profile.state === "error" && profile.message).toMatch(/RIOT_API_KEY/);
  });
});

describe("compliance", () => {
  it("the panel code never calls LCU endpoints that act on champ select", () => {
    const dir = join(__dirname, "..", "src");
    const files = ["main/index.ts", "main/coach.ts", "main/personal-coach.ts", "main/profile-source.ts", "preload/index.ts"];
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"|\/actions\/\d|lol-champ-select\/v1\/session\/actions/);
    }
  });
});
