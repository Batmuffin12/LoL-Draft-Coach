import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findIdentifiers,
  FixtureRecorder,
  LcuConnector,
  LcuHttp,
  LcuHttpError,
  sanitizeChampSelect,
  type ChampSelectSession,
  type LcuCredentials,
} from "../src/index";
import { loadFixture, MockLcuServer } from "../src/testing";

const waitFor = async (cond: () => boolean, timeoutMs = 5_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
};

let server: MockLcuServer | null = null;
let connector: LcuConnector | null = null;
afterEach(async () => {
  connector?.stop();
  await server?.stop();
  server = null;
  connector = null;
});

async function startMock(fixtureName = "synthetic-draft-pick", overrides = {}) {
  server = new MockLcuServer(loadFixture(fixtureName), overrides);
  const creds = await server.start();
  return creds;
}

describe("LcuHttp against the mock client", () => {
  it("authenticates, returns JSON and maps 404 to null", async () => {
    const creds = await startMock();
    const http = new LcuHttp(creds);
    expect(await http.get("/lol-gameflow/v1/gameflow-phase")).toBe("ChampSelect");
    expect(await http.get("/does/not/exist")).toBeNull();
    http.close();
  });

  it("rejects a wrong password", async () => {
    const creds = await startMock();
    const http = new LcuHttp({ ...creds, password: "wrong" });
    await expect(http.get("/lol-gameflow/v1/gameflow-phase")).rejects.toBeInstanceOf(LcuHttpError);
    http.close();
  });

  it("is read-only: no methods that can act on champ select", () => {
    const methods = Object.getOwnPropertyNames(LcuHttp.prototype);
    expect(methods.sort()).toEqual(["close", "constructor", "get"]);
  });
});

describe("LcuConnector replaying a fixture", () => {
  it("connects, streams the whole draft and ends when champ select closes", async () => {
    const creds = await startMock();
    const sessions: (ChampSelectSession | null)[] = [];
    const phases: string[] = [];
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.on("champSelect", (s) => sessions.push(s));
    connector.on("gameflowPhase", (p) => phases.push(p));
    connector.start();

    await waitFor(() => connector!.status === "connected" && server!.clientCount === 1);
    await waitFor(() => sessions.length === 1); // initial GET snapshot
    await server!.playAll();
    await waitFor(() => phases.includes("GameStart"));

    expect(phases[0]).toBe("ChampSelect");
    expect(sessions.at(-1)).toBeNull();
    const last = sessions.filter((s): s is ChampSelectSession => s !== null).at(-1)!;
    const draft = sanitizeChampSelect(last);
    expect(draft.myTeam.every((s) => s.championId > 0)).toBe(true);
    expect(draft.theirTeam.every((s) => s.championId > 0)).toBe(true);
  });

  it("reports searching while no client runs, then reconnects after a restart", async () => {
    let creds: LcuCredentials | null = null;
    const statuses: string[] = [];
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.on("status", (s) => statuses.push(s));
    connector.start();
    await waitFor(() => statuses.includes("searching"));

    creds = await startMock();
    await waitFor(() => connector!.status === "connected");
    server!.dropClients();
    await waitFor(() => statuses.includes("disconnected"));
    await waitFor(() => connector!.status === "connected" && server!.clientCount === 1);
    // Two full TLS + WebSocket handshakes: a cold Windows CI runner can take longer than the default 5 s.
  }, 20_000);

  it("exposes validated local reads (pickable champions, gameflow queue)", async () => {
    const creds = await startMock();
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.start();
    await waitFor(() => connector!.status === "connected");
    expect((await connector.getPickableChampionIds()).length).toBeGreaterThan(0);
    expect((await connector.getGameflowSession())?.gameData?.queue?.id).toBeTypeOf("number");
    expect(await connector.getRankedStats()).toBeNull(); // not in the fixture → 404
    expect(await connector.getOwnedChampionIds()).toEqual([]); // not in the fixture → 404
  });

  it("reads the champions you own, leaving out free rotations", async () => {
    const creds = await startMock("synthetic-draft-pick", {
      "/lol-champions/v1/owned-champions-minimal": [
        { id: 103, ownership: { owned: true, rental: { rented: false } }, freeToPlay: false },
        { id: 238, ownership: { owned: false }, freeToPlay: true },
        { id: 245 },
      ],
    });
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.start();
    await waitFor(() => connector!.status === "connected");
    expect(await connector.getOwnedChampionIds()).toEqual([103]);
  });
});

describe("FixtureRecorder", () => {
  it("records a full champ select into an anonymised fixture", async () => {
    const creds = await startMock("synthetic-draft-pick", {
      // A raw client would include identities; the recorder must strip them.
      "/lol-gameflow/v1/session": { phase: "ChampSelect", gameData: { gameId: 99, queue: { id: 400 } }, playerAlias: "x" },
    });
    const outDir = mkdtempSync(join(tmpdir(), "ldc-rec-"));
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    const saved: string[] = [];
    new FixtureRecorder(connector, outDir, (f) => saved.push(f));
    connector.start();
    await waitFor(() => server!.clientCount === 1);
    await new Promise((r) => setTimeout(r, 100)); // let the recorder take its snapshots
    // Inject identities into a live frame too.
    server!.push("/lol-champ-select/v1/session", {
      ...(loadFixture("synthetic-draft-pick").frames[0]!.data as object),
      myTeam: [{ cellId: 2, championId: 0, puuid: "leak", gameName: "Leak", tagLine: "L" }],
    });
    await server!.playAll();
    await waitFor(() => saved.length === 1);

    const files = readdirSync(outDir);
    expect(files).toHaveLength(1);
    const text = readFileSync(join(outDir, files[0]!), "utf8");
    expect(text).not.toContain("leak");
    expect(text).not.toContain("Leak");
    expect(findIdentifiers(JSON.parse(text))).toEqual([]);
    expect(JSON.parse(text).frames.length).toBeGreaterThan(10);
  });
});

describe("recommended positions", () => {
  it("reads Riot's recommended positions as normalised positions", async () => {
    const creds = await startMock();
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.start();
    await waitFor(() => connector!.status === "connected");
    const positions = await connector.getRecommendedPositions();
    expect(positions.get(245)).toEqual(["jungle", "middle"]);
    expect(positions.get(202)).toEqual(["bottom"]);
  });

  it("reads the stat shard rows from the rune paths (static game data)", async () => {
    const styles = [
      { id: 8000, slots: [{ type: "kKeyStone", perks: [8005, 8008] }, { type: "kStatMod", perks: [5008, 5005, 5007] }, { type: "kStatMod", perks: [5008, 5010, 5001] }] },
      { id: 8100, slots: [{ type: "kKeyStone", perks: [8112] }] },
    ];
    const creds = await startMock("synthetic-draft-pick", { "/lol-perks/v1/styles": styles });
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.start();
    await waitFor(() => connector!.status === "connected");
    expect(await connector.getStatShardRows()).toEqual([
      [5008, 5005, 5007],
      [5008, 5010, 5001],
    ]);
  });

  it("returns an empty map when the client doesn't serve them", async () => {
    const creds = await startMock("synthetic-draft-pick", { "/lol-perks/v1/recommended-champion-positions": null });
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    connector.start();
    await waitFor(() => connector!.status === "connected");
    expect((await connector.getRecommendedPositions()).size).toBe(0);
  });
});
