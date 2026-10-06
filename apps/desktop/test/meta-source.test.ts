import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { RiotApi } from "@ldc/riot-api";
import { createApp, createInvite, openDb, SyncScheduler } from "@ldc/server";
import type { MetaSnapshot } from "@ldc/shared";
import { AccountStore, type SecretBox } from "../src/main/account-store";
import { findConfigDir, loadConfig } from "../src/main/config";
import { MetaSource, type MetaStatus } from "../src/main/meta-source";
import { PersonalCoach } from "../src/main/personal-coach";
import { ServerProfileSource } from "../src/main/profile-source";
import { ServerClient, ServerError } from "../src/main/server-client";
import { fakeDdragonFetch, fakeRiotFetch, waitFor } from "./helpers";

const config = loadConfig(findConfigDir(__dirname));
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const NOW = Date.now();

/** A small band-2 snapshot: in middle, 245 is strong and 103 is average. */
function snapshot(createdAt = NOW): MetaSnapshot {
  const stat = (championId: number, games: number, wr: number) => ({ championId, role: "middle", games, wins: games * wr, n: games });
  return {
    format: 1,
    band: 2,
    createdAt,
    patch: "16.19",
    matches: 1000,
    newestMatchAt: createdAt,
    halfLifeDays: 10,
    roleGames: { top: 2000, jungle: 2000, middle: 2000, bottom: 2000, utility: 2000 },
    champions: [stat(103, 400, 0.5), stat(245, 400, 0.56), stat(84, 300, 0.49), stat(238, 300, 0.5)],
    matchups: [],
    duos: [],
    attributes: [],
    references: {},
    traitCuts: { magic: 0.4, physical: 0.6, frontline: 0.5, engage: 0.5, heal: 0.5 },
    builds: [
      {
        championId: 103,
        role: "middle",
        n: 400,
        timelineN: 300,
        games: 400,
        wins: 200,
        pages: [{ primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8138, 8135, 8226, 8210], statPerks: [5001, 5008, 5005], games: 300, wins: 160, n: 300 }],
        spells: [{ spells: [4, 14], games: 350, wins: 180, n: 350 }],
        skills: [{ first: [1, 3, 2], order: [1, 2, 3], games: 250, wins: 125, n: 250 }],
        starting: [{ items: [1056, 2003], games: 280, wins: 140, n: 280 }],
        core: [],
        items: [
          { itemId: 6655, slot: 1, n: 200, share: 0.66, winAdded: 0.012, minute: 13 },
          { itemId: 3020, slot: 2, n: 150, share: 0.5, winAdded: 0.004, minute: 17 },
        ],
        lifts: [],
        matchupPages: [],
      },
    ],
  };
}

/** A stand-in server client that answers meta requests from a list of scripted responses. */
function fakeClient(responses: (() => Awaited<ReturnType<ServerClient["meta"]>>)[]) {
  const calls: (string | null | undefined)[] = [];
  const client = {
    async meta(_band: number, etag?: string | null) {
      calls.push(etag);
      const next = responses.shift();
      if (!next) throw new ServerError(0, "unreachable", "Can't reach the coach server");
      return next();
    },
  } as unknown as ServerClient;
  return { client, calls };
}

describe("MetaSource", () => {
  it("downloads the band's snapshot, caches it, and revalidates with the ETag", async () => {
    const dir = tmp("ldc-meta-");
    const { client, calls } = fakeClient([() => ({ notModified: false, snapshot: snapshot(), etag: '"v1"' }), () => ({ notModified: true })]);
    let t = NOW;
    const src = new MetaSource({ client: () => client, cacheDir: dir, now: () => t, minIntervalMs: 1000 });
    const statuses: MetaStatus[] = [];
    src.on("status", (s) => statuses.push(s));
    await src.refresh(2);
    expect(src.snapshot?.patch).toBe("16.19");
    expect(statuses.at(-1)).toMatchObject({ state: "ready", band: 2, matches: 1000, offline: false });

    await src.refresh(2); // within the interval: no request
    expect(calls).toEqual([null]);
    t += 2000;
    await src.refresh(2);
    expect(calls).toEqual([null, '"v1"']);

    // A fresh start reads the cache before asking the server, and stays usable offline.
    const offline = new MetaSource({ client: () => fakeClient([]).client, cacheDir: dir });
    const seen: MetaStatus[] = [];
    offline.on("status", (s) => seen.push(s));
    await offline.refresh(2);
    expect(offline.snapshot?.band).toBe(2);
    expect(seen.at(-1)).toMatchObject({ state: "ready", offline: true });
  });

  it("doesn't drop a band change that arrives while another band is loading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const asked: number[] = [];
    const client = {
      async meta(band: number) {
        asked.push(band);
        if (band === 2) await gate;
        return { notModified: false, snapshot: { ...snapshot(), band }, etag: `"b${band}"` };
      },
    } as unknown as ServerClient;
    const src = new MetaSource({ client: () => client, cacheDir: tmp("ldc-meta-") });
    const a = src.refresh(2);
    expect(src.refresh(2)).toBe(a); // same band: joins
    const b = src.refresh(3); // the player's band changed mid-download
    release();
    await Promise.all([a, b]);
    expect(asked).toEqual([2, 3]);
    expect(src.snapshot?.band).toBe(3);
  });

  it("reports why there is no meta when nothing is cached and the server can't help", async () => {
    const src = new MetaSource({ client: () => fakeClient([]).client, cacheDir: tmp("ldc-meta-") });
    const seen: MetaStatus[] = [];
    src.on("status", (s) => seen.push(s));
    await src.refresh(2);
    expect(seen.at(-1)).toMatchObject({ state: "error" });
    const none = new MetaSource({ client: () => null, cacheDir: tmp("ldc-meta-") });
    const st: MetaStatus[] = [];
    none.on("status", (s) => st.push(s));
    await none.refresh(2);
    expect(st).toEqual([{ state: "none" }]);
  });
});

describe("PersonalCoach with the live meta (mock client + real server API)", () => {
  let lcu: MockLcuServer | null = null;
  let coach: PersonalCoach | null = null;
  afterEach(async () => {
    coach?.stop();
    await lcu?.stop();
  });

  it("scores picks as a predicted win chance once the band's snapshot arrives", async () => {
    const db = openDb(":memory:");
    const json = JSON.stringify(snapshot());
    db.$client
      .prepare("INSERT INTO meta_snapshots (band, created_at, etag, matches, patch, newest_match_at, size_bytes, body) VALUES (2, ?, ?, 1000, '16.19', ?, 0, ?)")
      .run(NOW, '"snap"', NOW, gzipSync(json));
    const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fakeRiotFetch().fetchFn });
    const sync = new SyncScheduler(db, riot, { history: config.app.history, bands: config.bands }, { tickMs: 1e9, staleAfterMs: 1e9, activeWithinMs: 1e9, log: () => {} });
    const app = createApp({ db, version: "test", riot, sync, registerPerMinute: 100 });
    const fetchFn = ((input: string | URL | Request, init?: RequestInit) => app.request(String(input), init)) as typeof fetch;
    const box: SecretBox = { encrypt: (s) => s, decrypt: (s) => s };
    const profiles = new ServerProfileSource({ accounts: new AccountStore(join(tmp("ldc-acct-"), "a.json"), box), defaultServerUrl: "https://coach.test", fetch: fetchFn, pollMs: 5 });
    await profiles.init();
    const meta = new MetaSource({ client: () => profiles.serverClient, cacheDir: tmp("ldc-meta-") });

    lcu = new MockLcuServer(loadFixture("synthetic-draft-pick"), {
      "/lol-summoner/v1/current-summoner": { puuid: "client-only", gameName: "Me", tagLine: "EUW", summonerId: 7 },
      "/lol-perks/v1/pages": [],
      "/lol-item-sets/v1/item-sets/7/sets": { itemSets: [] },
      "/lol-ranked/v1/current-ranked-stats": { queues: [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", division: "I" }] },
    });
    const creds = await lcu.start();
    coach = new PersonalCoach({
      connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }),
      config,
      profiles,
      riotId: null,
      meta,
    });
    await coach.start();
    await waitFor(() => coach!.currentIdentity !== null);
    await profiles.register("https://coach.test", createInvite(db, { ttlDays: 1, now: Date.now() }).code);
    await waitFor(() => coach!.state.status.profile.state === "ready");
    await waitFor(() => coach!.state.meta?.state === "ready");
    expect(coach.state.meta).toMatchObject({ state: "ready", band: 2, patch: "16.19", matches: 1000 });

    // Ban phase with the player hovering 245: the bans card adds a "For your 245" section.
    const fixture = loadFixture("synthetic-draft-pick");
    const banFrame = fixture.frames.find((f) => f.uri === "/lol-champ-select/v1/session" && f.t === 2000)!;
    const session = structuredClone(banFrame.data) as { myTeam: { cellId: number; championPickIntent: number }[] };
    session.myTeam.find((m) => m.cellId === 2)!.championPickIntent = 245;
    lcu.push("/lol-champ-select/v1/session", session);
    await waitFor(() => coach!.state.hoverBans?.champion.id === 245);
    expect(coach.state.hoverBans?.champion.id).toBe(245);
    expect(coach.state.hoverBans!.bans.every((b) => !coach!.state.bans.some((x) => x.champion.id === b.champion.id))).toBe(true);

    while (coach.state.draft?.localAction !== "pick" && lcu.step()) await new Promise((r) => setTimeout(r, 15));
    await waitFor(() => coach!.state.picks.length > 0);
    const picks = coach.state.picks;
    expect(picks.every((p) => p.expectedWin !== null && p.expectedWin > 0 && p.expectedWin < 1)).toBe(true);
    const strong = picks.find((p) => p.champion.id === 245);
    expect(strong?.reasons.join(" ")).toMatch(/Strong in middle in your rank: 56\.0% win rate \(400 games\)/);

    // A new scoring config from the server applies immediately.
    coach.setConfig({ ...config, engine: { ...config.engine, topN: 2 } });
    expect(coach.state.picks).toHaveLength(2);

    // Once the player locks in, suggestions stop and the panel shows their own pick.
    while (coach.state.myPick === null && lcu.step()) await new Promise((r) => setTimeout(r, 15));
    await waitFor(() => coach!.state.myPick !== null);
    expect(coach.state.myPick).toMatchObject({ champion: { id: 103 }, role: "middle" });
    expect(coach.state.myPick!.expectedWin).toBeGreaterThan(0);
    // …with the loadout from the band's builds.
    const loadout = coach.state.myPick!.loadout!;
    expect(loadout.page?.runes.map((r) => r.id)).toEqual([8112, 8139, 8138, 8135, 8226, 8210]);
    expect(loadout.page?.reason).toBe("Most successful common page: 53.3% win rate (300 games, 75% take it)");
    expect(loadout.skills).toMatchObject({ first: ["Q", "E", "W"], order: ["Q", "W", "E"] });
    expect(loadout.items.map((s) => s.top.id)).toEqual([6655, 3020]);
    expect(loadout.items[0]!.top.reasons[0]).toBe("+1.2% win added as item 1, where 66% buy it (200 games)");
    expect(loadout.source).toBe("Gold to Platinum + Emerald to Diamond");
    expect(loadout.thinNote).toBeNull(); // 400 games: enough

    // Import happens only when asked (the buttons), and writes only the rune page and the item set.
    expect(loadout.canImport).toBe(true);
    expect(lcu.writes).toEqual([]);
    await coach.importLoadout("runes");
    await coach.importLoadout("items");
    expect(lcu.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST /lol-perks/v1/pages", "PUT /lol-item-sets/v1/item-sets/7/sets"]);
    // Shards go to the client as offense, flex, defense.
    expect((lcu.writes[0]!.body as { selectedPerkIds: number[] }).selectedPerkIds).toEqual([8112, 8139, 8138, 8135, 8226, 8210, 5005, 5008, 5001]);
    const set = (lcu.writes[1]!.body as { itemSets: { associatedChampions: number[]; blocks: { items: { id: string }[] }[] }[] }).itemSets[0]!;
    expect(set.associatedChampions).toEqual([103]);
    expect(set.blocks.map((b) => b.items.map((i) => i.id))).toEqual([["1056", "2003"], ["6655", "3020"]]);
    expect(coach.state.myPick!.importMessage).toBe("Item set saved: open the shop in game to see it");

    // Champ select often ends seconds after you lock in: the card and its loadout stay until the game is over.
    lcu.push("/lol-champ-select/v1/session", null, "Delete");
    lcu.push("/lol-gameflow/v1/gameflow-phase", "InProgress");
    await waitFor(() => coach!.state.draft === null);
    expect(coach.state.myPick).toMatchObject({ champion: { id: 103 }, loadout: { canImport: false } });
    lcu.push("/lol-gameflow/v1/gameflow-phase", "EndOfGame");
    await waitFor(() => coach!.state.myPick === null);
    expect(coach.state.picks).toEqual([]);
    expect(coach.state.pickAdvice.whyNot).toBeNull();
  });
});
