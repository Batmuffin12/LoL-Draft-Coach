import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { MockLcuServer } from "@ldc/lcu/testing";
import { RiotApi } from "@ldc/riot-api";
import { loadScenario } from "@ldc/sim";
import { findConfigDir, loadConfig } from "../src/main/config";
import { MatchStore } from "../src/main/match-store";
import { MetaSource } from "../src/main/meta-source";
import { PersonalCoach, uiCopy } from "../src/main/personal-coach";
import { DirectProfileSource } from "../src/main/profile-source";
import { BuildTab } from "../src/renderer/components/Loadout";
import { setCopy } from "../src/renderer/format";
import type { LoadoutView, ViewState } from "../src/shared/view";
import { fakeDdragonFetch, fakeRiotFetch, stepUntil, waitFor } from "./helpers";

/**
 * Riot's rules at the panel's edge (CLAUDE.md): whatever the client and the Riot API send about
 * other players, none of it reaches the view; the writer only runs from a click; items are never
 * shown with a raw win rate.
 */

const config = loadConfig(findConfigDir(__dirname));
const SRC = join(__dirname, "..", "src");
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

const SECRET = "SECRET-IDENTITY";
const IDENTITY = { puuid: SECRET, summonerId: 987_654_321, gameName: SECRET, tagLine: SECRET, summonerName: SECRET, displayName: SECRET, riotId: SECRET, playerAlias: SECRET, tier: SECRET, division: SECRET, futureField: { name: SECRET } };

/** The identity fields on every object of a payload, at any depth. */
function poisoned<T>(value: T): T {
  if (Array.isArray(value)) return value.map(poisoned) as T;
  if (value === null || typeof value !== "object") return value;
  return { ...Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poisoned(v)])), ...IDENTITY } as T;
}

const sourceFiles = (dir = SRC): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const name = (p: string) => relative(SRC, p).replaceAll("\\", "/");
const filesMatching = (re: RegExp) => sourceFiles().filter((f) => re.test(readFileSync(f, "utf8"))).map(name).sort();

describe("no other player's identity reaches the view", () => {
  let lcu: MockLcuServer | null = null;
  let coach: PersonalCoach | null = null;
  afterEach(async () => {
    coach?.stop();
    await lcu?.stop();
  });

  it("through a whole draft on live data, with every payload carrying names", async () => {
    const scenario = await loadScenario("locked-solid");
    const draft = scenario.draft;
    lcu = new MockLcuServer(
      {
        ...draft,
        snapshots: Object.fromEntries(Object.entries(draft.snapshots).map(([path, body]) => [path, path.includes("champ-select") || path.includes("gameflow") ? poisoned(body) : body])),
        frames: draft.frames.map((f) => ({ ...f, data: poisoned(f.data) })),
      },
      {
        // The local player's own Riot ID is used to load their own games, and goes no further.
        "/lol-summoner/v1/current-summoner": { puuid: "client-only", gameName: "Me", tagLine: "EUW", summonerId: 7 },
        "/lol-ranked/v1/current-ranked-stats": { queues: [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", division: "I" }] },
        "/lol-lobby/v2/lobby": { localMember: { firstPositionPreference: "MIDDLE", secondPositionPreference: "TOP", ...IDENTITY }, members: [poisoned({ firstPositionPreference: "TOP" })], gameConfig: { queueId: 420, isCustom: false, ...IDENTITY } },
      },
    );
    const creds = await lcu.start();
    const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fakeRiotFetch().fetchFn });
    const matchesDir = tmp("ldc-comp-");
    coach = new PersonalCoach({
      connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }),
      config,
      profiles: new DirectProfileSource({ riot, history: config.app.history, bands: config.bands, storeFor: (puuid) => new MatchStore(matchesDir, puuid) }),
      riotId: null,
      meta: new MetaSource({ client: () => null, cacheDir: tmp("ldc-meta-"), fixed: scenario.meta! }),
    });
    const states: ViewState[] = [];
    coach.on("state", (s) => states.push(s));
    await coach.start();
    await waitFor(() => coach!.state.status.profile.state === "ready" && lcu!.clientCount === 1);
    await stepUntil(lcu, coach, () => coach!.state.myPick !== null, 200);
    await waitFor(() => coach!.state.myPick !== null);
    // The draft really was on screen, with the rest of the panel around it.
    expect(states.some((s) => s.draft !== null)).toBe(true);
    expect(coach.state.myPick!.loadout).not.toBeNull();
    expect(coach.state.roles.length).toBeGreaterThan(0);

    const everything = JSON.stringify({ states, list: coach.explore.list(), games: coach.explore.games() });
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain("987654321");
    expect(everything).not.toMatch(/puuid|summonerId|summonerName|gameName|tagLine|mock-local|client-only|name-other|other-\d/i);
  });
});

describe("the LCU writer only runs from the player's click", () => {
  it("is created in one place, and that place holds the import button's flow", () => {
    expect(filesMatching(/new LcuImporter\(/)).toEqual(["main/import-flow.ts"]);
  });

  it("the import buttons' one route: renderer click > preload > IPC > coach > flow", () => {
    expect(filesMatching(/\bwindow\.coach\.importLoadout\(/)).toEqual(["renderer/screens/LockedInScreen.tsx"]);
    expect(filesMatching(/IPC\.importLoadout/)).toEqual(["main/index.ts", "preload/index.ts"]);
    expect(filesMatching(/(?<!window\.)\bcoach\.importLoadout\(/)).toEqual(["main/index.ts"]);
    expect(filesMatching(/\bimports\.run\(/)).toEqual(["main/personal-coach.ts"]);
    expect(filesMatching(/\bimportShownLoadout\(/).filter((f) => f !== "main/loadout-import.ts")).toEqual(["main/import-flow.ts"]);
  });

  it("the coach's own events never lead to a write: only the IPC handler calls it", () => {
    const coach = readFileSync(join(SRC, "main/personal-coach.ts"), "utf8");
    expect(coach.match(/this\.imports\.run\(/g)).toHaveLength(1);
    expect(coach.match(/importLoadout\(/g)).toHaveLength(1);
    const index = readFileSync(join(SRC, "main/index.ts"), "utf8");
    expect(index.match(/ipcMain\.(handle|on)\(IPC\.importLoadout/g)).toHaveLength(1);
    expect(index.match(/\.importLoadout\(/g)).toHaveLength(1);
  });

  it("nothing else in the app talks to the client's API directly", () => {
    expect(filesMatching(/["'`]\/lol-[a-z-]+\//)).toEqual([]);
    expect(filesMatching(/from "node:https?"/)).toEqual([]);
  });

  it("never mentions an Arena augment, and the queues it supports don't include Arena", () => {
    expect(filesMatching(/augment/i)).toEqual([]);
    const json = readFileSync(join(findConfigDir(__dirname), "app.v1.json"), "utf8");
    expect(json).not.toMatch(/arena|augment/i);
    expect(config.app.history.queues.every((q) => q !== 1700 && q !== 1710)).toBe(true);
  });
});

describe("items are never shown with a raw win rate", () => {
  beforeAll(() => setCopy(uiCopy(config.explain.templates)));

  const option = (id: number, share: number, winAdded: number | null) => ({ id, name: `Item ${id}`, iconUrl: null, reasons: [], share, winAdded });
  const loadout = (): LoadoutView => ({
    games: 500,
    source: "Gold to Diamond",
    sourceAbove: true,
    thinNote: null,
    page: null,
    pageAlt: null,
    spells: null,
    skills: null,
    // A start can carry a share of games: any win rate on it must stay off the path.
    starting: { items: [{ id: 1056, name: "Start item", iconUrl: null }], counts: [1], reason: null, winRate: 0.7171, games: 300 },
    laterPool: [],
    laterNote: null,
    situational: [],
    quest: [],
    boots: { top: option(3020, 0.5, 0.012), alternatives: [option(3158, 0.2, -0.004)] },
    items: [{ slot: 1, minute: 11, top: option(6655, 0.66, 0.012), alternatives: [option(3157, 0.2, 0.002)] }],
    commonPath: null,
    canImport: false,
    spikeSlots: [],
  });

  it("the build path says what an item adds, in points, and never a win rate", () => {
    const html = renderToStaticMarkup(createElement(BuildTab, { loadout: loadout(), winAdded: true }));
    expect(html).toContain("Item 6655");
    expect(html).toContain("66%"); // bought by
    expect(html).toMatch(/\+1\.2/); // win added
    expect(html).not.toMatch(/\bWR\b|win rate/i);
    expect(html).not.toContain("71.7");
    expect(html).not.toContain("72%");
  });

  it("with the win added left out, there's still no win rate to fall back on", () => {
    const html = renderToStaticMarkup(createElement(BuildTab, { loadout: loadout(), winAdded: false }));
    expect(html).not.toMatch(/\bWR\b|win rate/i);
    expect(html).not.toContain("72%");
  });

  it("an item's option type has no win rate field for a screen to show", () => {
    const text = readFileSync(join(SRC, "shared/view.ts"), "utf8");
    const body = /export interface ItemOptionView[^{]*\{([^}]*)\}/.exec(text)![1]!;
    expect(body).toContain("winAdded");
    expect(body).not.toMatch(/winRate|\bwins\b/);
  });
});
