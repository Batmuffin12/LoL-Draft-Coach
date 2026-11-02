import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChampSelectSessionSchema, LcuConnector, LcuHttp, LcuImporter, LcuSocket, LcuWriteError, MY_SELECTION, PERKS_PAGES, parseLcu, sanitizeChampSelect, unavailableChampions, type LcuCredentials } from "../src/index";
import { loadFixture, MockLcuServer } from "../src/testing";

/**
 * The Riot rules in the code's own words (CLAUDE.md): no other player's identity past the sanitiser,
 * reads and subscriptions only, and one narrow writer. These must fail when anyone loosens a rule.
 */

const SECRET = "SECRET-IDENTITY";
const SECRET_NUMBER = 987_654_321_012;
/** What Riot sends about players today, and what a later client might add. */
const IDENTITY = {
  puuid: SECRET,
  obfuscatedPuuid: SECRET,
  summonerId: SECRET_NUMBER,
  obfuscatedSummonerId: SECRET_NUMBER,
  gameName: SECRET,
  tagLine: SECRET,
  summonerName: SECRET,
  displayName: SECRET,
  internalName: SECRET,
  riotId: SECRET,
  playerAlias: SECRET,
  nameVisibilityType: SECRET,
  rank: SECRET,
  tier: SECRET,
  matchHistory: [{ champion: SECRET }],
  someFutureField: { nested: { name: SECRET } },
};

/** Adds the identity fields to every object in the payload, at any depth. */
function poisoned(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(poisoned);
  if (value === null || typeof value !== "object") return value;
  return { ...Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poisoned(v)])), ...IDENTITY };
}

const fixture = loadFixture("synthetic-draft-pick");
const frames = fixture.frames.filter((f) => f.uri === "/lol-champ-select/v1/session" && f.data);

describe("sanitizeChampSelect is an allowlist", () => {
  it("lets no identity through from any frame, wherever Riot puts it", () => {
    expect(frames.length).toBeGreaterThan(5);
    for (const f of frames) {
      const raw = poisoned(f.data);
      // The schema tolerates new fields, so they do reach the sanitiser: it's the only thing stopping them.
      expect(JSON.stringify(parseLcu(ChampSelectSessionSchema, f.uri, raw))).toContain(SECRET);
      const text = JSON.stringify(sanitizeChampSelect(parseLcu(ChampSelectSessionSchema, f.uri, raw)));
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(String(SECRET_NUMBER));
    }
  });

  it("gives exactly the draft's fields: a new one is a decision, not an accident", () => {
    const d = sanitizeChampSelect(parseLcu(ChampSelectSessionSchema, "s", frames.at(-1)!.data));
    expect(Object.keys(d).sort()).toEqual(["actions", "isCustomGame", "localCellId", "myBans", "myTeam", "theirBans", "theirTeam", "timeLeftMs", "timerPhase"]);
    for (const slot of [...d.myTeam, ...d.theirTeam]) expect(Object.keys(slot).sort()).toEqual(["cellId", "championId", "isLocalPlayer", "pickIntentId", "position"]);
    expect(d.actions.length).toBeGreaterThan(0);
    for (const a of d.actions) expect(Object.keys(a).sort()).toEqual(["actorCellId", "championId", "completed", "id", "inProgress", "isAllyAction", "type"]);
  });

  it("marks only your own seat as the local player", () => {
    const d = sanitizeChampSelect(parseLcu(ChampSelectSessionSchema, "s", frames.at(-1)!.data));
    expect(d.myTeam.filter((s) => s.isLocalPlayer).map((s) => s.cellId)).toEqual([d.localCellId]);
    expect(d.theirTeam.some((s) => s.isLocalPlayer)).toBe(false);
  });
});

describe("unavailableChampions", () => {
  const session = (over: object) => parseLcu(ChampSelectSessionSchema, "s", { ...(frames[0]!.data as object), ...over });
  const seat = (cellId: number, championId: number) => ({ cellId, championId, championPickIntent: 0, assignedPosition: "" });

  it("takes bans, completed actions and other players' champions, but not your own or empty seats", () => {
    const local = (frames[0]!.data as { localPlayerCellId: number }).localPlayerCellId;
    const d = sanitizeChampSelect(
      session({
        myTeam: [seat(local, 103), seat(local + 1, 86)],
        theirTeam: [seat(7, 54), seat(8, 0)],
        bans: { myTeamBans: [238, 0], theirTeamBans: [11], numBans: 0 },
        actions: [[{ id: 1, type: "pick", actorCellId: 8, championId: 25, completed: true, isInProgress: false, isAllyAction: false }, { id: 2, type: "pick", actorCellId: 9, championId: 99, completed: false, isInProgress: true, isAllyAction: false }]],
      }),
    );
    expect([...unavailableChampions(d)].sort((a, b) => a - b)).toEqual([11, 25, 54, 86, 238]);
  });
});

let server: MockLcuServer | null = null;
let importer: LcuImporter | null = null;
let connector: LcuConnector | null = null;
afterEach(async () => {
  connector?.stop();
  importer?.close();
  await server?.stop();
  server = connector = importer = null;
});

async function start(overrides: Record<string, unknown> = {}): Promise<LcuCredentials> {
  server = new MockLcuServer(fixture, {
    "/lol-perks/v1/pages": [{ id: 1, name: "My own page", isEditable: true }],
    "/lol-summoner/v1/current-summoner": { summonerId: 42 },
    "/lol-item-sets/v1/item-sets/42/sets": { itemSets: [] },
    ...overrides,
  });
  return server.start();
}

describe("the LCU writer's allowlist", () => {
  const ANY = { spell1Id: 4, spell2Id: 14 };

  it.each([
    // Everything that acts on the draft.
    ["POST", "/lol-champ-select/v1/session/actions/1/complete"],
    ["PATCH", "/lol-champ-select/v1/session/actions/1"],
    ["POST", "/lol-lobby-team-builder/champ-select/v1/session/actions/1/complete"],
    ["PATCH", "/lol-champ-select/v1/session/my-selection/"],
    ["POST", "/lol-champ-select/v1/session/my-selection"],
    ["PUT", "/lol-champ-select/v1/session/my-selection"],
    ["POST", "/lol-champ-select/v1/session/bench/swap/103"],
    ["POST", "/lol-matchmaking/v1/ready-check/accept"],
    // The allowed paths with something on the end, or dressed up.
    [" POST", PERKS_PAGES],
    ["PATCH", `${MY_SELECTION}?championId=103`],
    ["PATCH", `${MY_SELECTION}/../actions/1`],
    ["POST", `${PERKS_PAGES}?x=1`],
    ["POST", `${PERKS_PAGES}/`],
    ["POST", `${PERKS_PAGES}\n/lol-champ-select/v1/session/actions/1/complete`],
    ["PUT", `${PERKS_PAGES}/1/../../../lol-champ-select/v1/session/actions/1`],
    ["PUT", `${PERKS_PAGES}/abc`],
    ["PUT", "/lol-perks/v1/currentpage"],
    ["PUT", "/lol-item-sets/v1/item-sets/42/sets/extra"],
    ["PUT", "/lol-item-sets/v1/item-sets/me/sets"],
    ["POST", "/lol-item-sets/v1/item-sets/42/sets"],
    // Other methods on allowed paths.
    ["PATCH", PERKS_PAGES],
    ["DELETE", `${PERKS_PAGES}/1`],
    ["DELETE", MY_SELECTION],
    ["GET", MY_SELECTION],
  ])("refuses %s %s before anything is sent", async (method, path) => {
    importer = new LcuImporter(await start());
    await expect(importer.write(method as "POST", path, ANY)).rejects.toSatisfy((e) => e instanceof LcuWriteError && e.reason === "notAllowed");
    expect(server!.writes).toEqual([]);
  });

  it.each([
    [{ spell1Id: 4, championId: 103 }],
    [{ selectedSkinId: 1 }],
    [{ wardSkinId: 1, spell1Id: 4, spell2Id: 14 }],
    [{ actionId: 1, completed: true }],
    [{}],
    [[]],
    [["spell1Id"]],
    ["spell1Id"],
    [null],
    [undefined],
    [4],
  ])("the spells call carries nothing but the two spells, so refuses %j", async (body) => {
    importer = new LcuImporter(await start());
    await expect(importer.write("PATCH", MY_SELECTION, body)).rejects.toMatchObject({ reason: "notAllowed" });
    expect(server!.writes).toEqual([]);
  });

  it("lets through exactly what the import buttons send", async () => {
    importer = new LcuImporter(await start());
    await importer.write("PATCH", MY_SELECTION, { spell1Id: 4 });
    await importer.write("PATCH", MY_SELECTION, { spell1Id: 4, spell2Id: 14 });
    await importer.write("POST", PERKS_PAGES, { name: "LDC: x" });
    await importer.write("PUT", `${PERKS_PAGES}/1000`, { name: "LDC: x" });
    await importer.write("PUT", "/lol-item-sets/v1/item-sets/42/sets", { itemSets: [] });
    expect(server!.writes.map((w) => w.method)).toEqual(["PATCH", "PATCH", "POST", "PUT", "PUT"]);
  });

  it("an import makes no write beyond its own: the rune page touches the pages, the spells only your selection", async () => {
    importer = new LcuImporter(await start({ "/lol-champ-select/v1/session": { localPlayerCellId: 2, myTeam: [{ cellId: 2 }] } }));
    await importer.importRunePage({ name: "Ahri", primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [] });
    await importer.importSpells([4, 14]);
    await importer.importItemSet({ title: "Ahri", championId: 103, mapId: 11, blocks: [] });
    expect(server!.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST /lol-perks/v1/pages", "PATCH /lol-champ-select/v1/session/my-selection", "PUT /lol-item-sets/v1/item-sets/42/sets"]);
    expect(server!.writes[1]!.body).toEqual({ spell1Id: 4, spell2Id: 14 });
  });
});

describe("what a refused or failed import looks like", () => {
  const page = { name: "Ahri", primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [] };

  it("never overwrites a page that isn't ours, or ours when the client marks it locked", async () => {
    importer = new LcuImporter(await start({ "/lol-perks/v1/pages": [{ id: 1, name: "LDC-like but mine", isEditable: true }, { id: 2, name: "LDC: preset", isEditable: false }] }));
    expect(await importer.importRunePage(page)).toBe("created");
    expect(server!.writes.map((w) => w.method)).toEqual(["POST"]);
  });

  it("keeps the page name within the client's 25 characters, prefix included", async () => {
    importer = new LcuImporter(await start());
    await importer.importRunePage({ ...page, name: "A very long champion name indeed" });
    expect((server!.writes[0]!.body as { name: string }).name).toHaveLength(25);
  });

  it("tells a full page list only from creating a page: a 400 elsewhere is just a failure", async () => {
    importer = new LcuImporter(await start());
    server!.maxPages = 0;
    await expect(importer.importRunePage(page)).rejects.toMatchObject({ reason: "pagesFull", status: 400 });
    server!.failWritesWith = 400;
    await expect(importer.write("PUT", `${PERKS_PAGES}/1`, {})).rejects.toMatchObject({ reason: "failed", status: 400 });
    server!.failWritesWith = 500;
    await expect(importer.write("POST", PERKS_PAGES, {})).rejects.toMatchObject({ reason: "failed", status: 500 });
  });

  it("fails cleanly when the client can't say what it has, and writes nothing", async () => {
    importer = new LcuImporter(await start({ "/lol-perks/v1/pages": null }));
    await expect(importer.importRunePage(page)).rejects.toMatchObject({ reason: "failed", status: 404 });
    await expect(importer.importRunePage(page)).rejects.toBeInstanceOf(LcuWriteError);
    expect(server!.writes).toEqual([]);
  });

  it("rejects a page list it can't read instead of guessing", async () => {
    importer = new LcuImporter(await start({ "/lol-perks/v1/pages": { not: "a list" } }));
    await expect(importer.importRunePage(page)).rejects.toThrow();
    expect(server!.writes).toEqual([]);
  });

  it("rejects with the wrong password rather than writing", async () => {
    const creds = await start();
    importer = new LcuImporter({ ...creds, password: "wrong" });
    await expect(importer.importRunePage(page)).rejects.toMatchObject({ status: 401, reason: "failed" });
    expect(server!.writes).toEqual([]);
  });

  it("rejects when the client is gone", async () => {
    const creds = await start();
    await server!.stop();
    importer = new LcuImporter(creds);
    await expect(importer.importRunePage(page)).rejects.toThrow();
  });
});

describe("spell keys", () => {
  const withSpells = (spell1Id: number, spell2Id: number) => start({ "/lol-champ-select/v1/session": { localPlayerCellId: 2, myTeam: [{ cellId: 2, spell1Id, spell2Id }, { cellId: 1, spell1Id: 12, spell2Id: 4 }] } });

  it("leaves the spells in order when neither is on the other's key", async () => {
    importer = new LcuImporter(await withSpells(32, 11));
    await importer.importSpells([4, 12]);
    expect(server!.writes[0]!.body).toEqual({ spell1Id: 4, spell2Id: 12 });
  });

  it("keeps a spell on your key, reading your own seat and not a teammate's", async () => {
    importer = new LcuImporter(await withSpells(12, 32));
    await importer.importSpells([4, 12]);
    expect(server!.writes[0]!.body).toEqual({ spell1Id: 12, spell2Id: 4 });
  });

  it("swaps when the first spell already sits on the second key", async () => {
    importer = new LcuImporter(await withSpells(32, 4));
    await importer.importSpells([4, 12]);
    expect(server!.writes[0]!.body).toEqual({ spell1Id: 12, spell2Id: 4 });
  });
});

describe("reading is all the rest of the adapter can do", () => {
  it("LcuHttp and LcuSocket offer no way to send anything else", () => {
    expect(Object.getOwnPropertyNames(LcuHttp.prototype).sort()).toEqual(["close", "constructor", "get"]);
    expect(Object.getOwnPropertyNames(LcuSocket.prototype).sort()).toEqual(["close", "connect", "constructor", "subscribe"]);
    expect(Object.getOwnPropertyNames(LcuConnector.prototype).filter((m) => /^(post|put|patch|delete|write|send|pick|ban|lock|import)/i.test(m))).toEqual([]);
  });

  it("only the writer in this package holds a non-GET request; the socket only subscribes", () => {
    const dir = join(__dirname, "..", "src");
    const http = readFileSync(join(dir, "http.ts"), "utf8");
    expect(http.match(/method: "\w+"/g)).toEqual(['method: "GET"']);
    for (const f of readdirSync(dir)) {
      if (f === "writer.ts" || f === "mock-server.ts") continue;
      const code = readFileSync(join(dir, f), "utf8");
      expect(code, f).not.toMatch(/method:\s*["'`](POST|PUT|PATCH|DELETE)/);
      expect(code, f).not.toMatch(/lol-[\w-]+\/v\d+\/[^"'`]*(actions|my-selection|complete|accept)/);
    }
    const socket = readFileSync(join(dir, "socket.ts"), "utf8");
    expect(socket.match(/\.send\(/g)).toHaveLength(1);
    expect(socket).toContain("ws?.send(JSON.stringify([WAMP.SUBSCRIBE");
  });

  it("a whole draft, with every read the app makes, sends the client nothing but GETs", async () => {
    const creds = await start();
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    const ended = new Promise<void>((resolve) => connector!.on("gameflowPhase", (p) => p === "GameStart" && resolve()));
    const connected = new Promise<void>((resolve) => connector!.on("status", (s) => s === "connected" && resolve()));
    connector.start();
    await connected;
    await Promise.all([connector.getChampSelect(), connector.getPickableChampionIds(), connector.getOwnedChampionIds(), connector.getGameflowSession(), connector.getRecentGames(), connector.getLobby(), connector.getRankedStats(), connector.getRecommendedPositions(), connector.getPerks(), connector.getStatShardRows(), connector.getCurrentSummoner()]);
    while (server!.clientCount < 1) await new Promise((r) => setTimeout(r, 5));
    await server!.playAll();
    await ended;
    expect(server!.writes).toEqual([]);
  }, 20_000);
});
