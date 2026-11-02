import { afterEach, describe, expect, it } from "vitest";
import { eventNameForPath, LcuConnector, lobbyRoles, parseWampMessage, type LobbyRoles } from "../src/index";
import { loadFixture, MockLcuServer } from "../src/testing";

const waitFor = async (cond: () => boolean, timeoutMs = 10_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
};

let server: MockLcuServer | null = null;
let connector: LcuConnector | null = null;
afterEach(async () => {
  connector?.stop();
  await server?.stop();
  server = connector = null;
});

async function connected(overrides: Record<string, unknown> = {}) {
  server = new MockLcuServer(loadFixture("synthetic-draft-pick"), overrides);
  const creds = await server.start();
  connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 10 });
  // The lobby comes last of the connector's first reads; by then, nothing of the start is still on its way.
  let settled = false;
  connector.once("lobby", () => (settled = true));
  connector.start();
  const subscribed = () => [...(server as unknown as { subscriptions: Map<unknown, Set<string>> }).subscriptions.values()].some((s) => s.size === 3);
  await waitFor(() => settled && subscribed());
  return connector;
}

describe("LcuConnector when the client misbehaves", () => {
  it("a discovery that throws counts as no client yet, and it keeps looking", async () => {
    let calls = 0;
    connector = new LcuConnector({
      discover: async () => {
        calls++;
        throw new Error("powershell failed");
      },
      pollIntervalMs: 5,
    });
    connector.start();
    await waitFor(() => calls >= 3);
    expect(connector.status).toBe("searching");
    expect(connector.credentials).toBeNull();
  });

  it("a client whose API isn't ready sends it back to polling, without saying connected", async () => {
    server = new MockLcuServer(loadFixture("synthetic-draft-pick"));
    const creds = await server.start();
    const statuses: string[] = [];
    connector = new LcuConnector({ discover: async () => ({ ...creds, password: "wrong" }), pollIntervalMs: 5 });
    connector.on("status", (s) => statuses.push(s));
    connector.start();
    await waitFor(() => statuses.filter((s) => s === "searching").length >= 2);
    expect(statuses).not.toContain("connected");
  });

  it("gives its credentials only while connected", async () => {
    const c = await connected();
    expect(c.credentials?.password).toBe(server!.password);
    server!.dropClients();
    await waitFor(() => c.status !== "connected");
    expect(c.credentials).toBeNull();
  });

  it("a payload that doesn't fit is a schema error, not a crash, and the next good one still arrives", async () => {
    const c = await connected();
    const errors: Error[] = [];
    const phases: string[] = [];
    c.on("schemaError", (e) => errors.push(e));
    c.on("gameflowPhase", (p) => phases.push(p));
    server!.push("/lol-champ-select/v1/session", { localPlayerCellId: "two" });
    server!.push("/lol-lobby/v2/lobby", { localMember: "nope" });
    server!.push("/lol-gameflow/v1/gameflow-phase", 42);
    server!.push("/lol-gameflow/v1/gameflow-phase", "Lobby");
    await waitFor(() => phases.includes("Lobby"));
    expect(errors).toHaveLength(3);
    expect(errors[0]!.message).toMatch(/lol-champ-select/);
  });

  it("the end of champ select and of a lobby arrive as null, by a Delete or by no data", async () => {
    const c = await connected();
    const sessions: unknown[] = [];
    const lobbies: (LobbyRoles | null)[] = [];
    c.on("champSelect", (s) => sessions.push(s));
    c.on("lobby", (l) => lobbies.push(l));
    server!.push("/lol-champ-select/v1/session", null, "Delete");
    server!.push("/lol-champ-select/v1/session", null);
    server!.push("/lol-lobby/v2/lobby", { localMember: { firstPositionPreference: "TOP" } });
    server!.push("/lol-lobby/v2/lobby", null, "Delete");
    server!.push("/lol-lobby/v2/lobby", null);
    await waitFor(() => lobbies.length >= 3);
    expect(sessions).toEqual([null, null]);
    expect(lobbies).toEqual([{ positions: ["top"], queueId: null, isCustom: false }, null, null]);
  });

  it("passes each event to the recorder as well as to the coach", async () => {
    const c = await connected();
    const raw: string[] = [];
    c.on("rawEvent", (e) => raw.push(e.uri));
    const seen: unknown[] = [];
    c.on("champSelect", (s) => seen.push(s));
    server!.push("/lol-champ-select/v1/session", null, "Delete");
    await waitFor(() => raw.length === 1);
    expect(raw).toEqual(["/lol-champ-select/v1/session"]);
    expect(seen).toEqual([null]);
  });

  it("start twice runs one loop; stop ends it and says disconnected", async () => {
    let calls = 0;
    connector = new LcuConnector({
      discover: async () => {
        calls++;
        return null;
      },
      pollIntervalMs: 20,
    });
    const statuses: string[] = [];
    connector.on("status", (s) => statuses.push(s));
    connector.start();
    connector.start();
    await waitFor(() => calls >= 1);
    expect(calls).toBe(1);
    connector.stop();
    expect(connector.status).toBe("disconnected");
    const after = calls;
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBeLessThanOrEqual(after + 1);
  });

  it("reads need a connection, and say so", async () => {
    const c = new LcuConnector({ discover: async () => null });
    await expect(c.getChampSelect()).rejects.toThrow(/Not connected/);
    await expect(c.getRaw("/x")).rejects.toThrow(/Not connected/);
  });
});

describe("LcuConnector's reads", () => {
  it("your own recent games, newest first, with when they ended, asked for the count wanted", async () => {
    const c = await connected({
      "/lol-match-history/v1/products/lol/current-summoner/matches": {
        games: {
          games: [
            { gameId: 1, queueId: 420, gameCreation: 1_000, gameDuration: 10, participants: [{ participantIdentities: "ignored" }] },
            { gameId: 2, queueId: 440, gameCreation: 5_000, gameDuration: 20 },
          ],
        },
      },
    });
    expect(await c.getRecentGames(2)).toEqual([
      { gameId: 2, queueId: 440, endedAt: 25_000 },
      { gameId: 1, queueId: 420, endedAt: 11_000 },
    ]);
  });

  it.each([
    ["getRecentGames", []],
    ["getLobby", null],
    ["getPerks", []],
    ["getStatShardRows", []],
    ["getCurrentSummoner", null],
    ["getGameflowSession", null],
    ["getPickableChampionIds", []],
    ["getChampSelect", null],
  ] as const)("%s reads as nothing when the client has none (404)", async (method, want) => {
    server = new MockLcuServer({ format: 1, description: "", recordedAt: "", snapshots: { "/lol-gameflow/v1/gameflow-phase": "None" }, frames: [] });
    const creds = await server.start();
    connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 10 });
    connector.start();
    await waitFor(() => connector!.status === "connected");
    expect(await connector[method]()).toEqual(want);
  });

  it("reads runes, your summoner and shard rows when the client has them", async () => {
    const c = await connected({
      "/lol-perks/v1/perks": [{ id: 5005, name: "Attack Speed", iconPath: "/x.png" }],
      "/lol-summoner/v1/current-summoner": { puuid: "p", gameName: "Me", tagLine: "EUW" },
      "/lol-perks/v1/styles": [{ id: 8000, slots: [{ type: "kKeyStone", perks: [8005] }] }],
    });
    expect((await c.getPerks())[0]).toMatchObject({ id: 5005, name: "Attack Speed" });
    expect(await c.getCurrentSummoner()).toMatchObject({ gameName: "Me", tagLine: "EUW" });
    expect(await c.getStatShardRows()).toEqual([]);
    expect(await c.getRaw("/lol-summoner/v1/current-summoner")).toMatchObject({ gameName: "Me" });
  });
});

describe("the lobby's roles", () => {
  it("keeps two different choices in order, and drops the same one twice", () => {
    expect(lobbyRoles({ localMember: { firstPositionPreference: "JUNGLE", secondPositionPreference: "JUNGLE" } } as never).positions).toEqual(["jungle"]);
    expect(lobbyRoles({ localMember: { firstPositionPreference: "UNSELECTED", secondPositionPreference: "" } } as never).positions).toEqual([]);
    expect(lobbyRoles({ gameConfig: { queueId: 440, isCustom: true } } as never)).toEqual({ positions: [], queueId: 440, isCustom: true });
  });
});

describe("WAMP frames", () => {
  it("makes the client's event name from a path", () => {
    expect(eventNameForPath("/lol-champ-select/v1/session")).toBe("OnJsonApiEvent_lol-champ-select_v1_session");
  });

  it("reads an event and tolerates what's missing", () => {
    expect(parseWampMessage(JSON.stringify([8, "x", { uri: "/a", eventType: "Update", data: { n: 1 } }]))).toEqual({ uri: "/a", eventType: "Update", data: { n: 1 } });
    expect(parseWampMessage(JSON.stringify([8, "x", { uri: "/a" }]))).toEqual({ uri: "/a", eventType: "", data: null });
  });

  it.each([[""], ["not json"], ["{}"], ["[5,\"x\"]"], ["[8,\"x\"]"], ['[8,"x",{"eventType":"Update"}]'], ['[8,"x",{"uri":7}]']])("ignores %s", (raw) => {
    expect(parseWampMessage(raw)).toBeNull();
  });
});
