import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { RiotApi } from "@ldc/riot-api";
import { Coach } from "../src/main/coach";
import { findConfigDir, loadConfig } from "../src/main/config";
import { MatchStore } from "../src/main/match-store";
import { PersonalCoach } from "../src/main/personal-coach";
import { logProblem } from "../src/main/problem-log";
import { DirectProfileSource } from "../src/main/profile-source";
import { CLIENT_PUUID, fakeDdragonFetch, fakeRiotFetch, stepUntil, waitFor } from "./helpers";

vi.mock("../src/main/problem-log", () => ({ logProblem: vi.fn() }));

const config = loadConfig(findConfigDir(__dirname));
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

/** A Data Dragon CDN on this version, with the version in champion names to tell patches apart. */
function cdn(version: string): typeof fetch {
  const fake = fakeDdragonFetch();
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("versions.json")) return Response.json([version]);
    const res = await fake(input);
    if (!url.endsWith("champion.json")) return res;
    const file = (await res.json()) as { data: Record<string, { name: string }> };
    for (const c of Object.values(file.data)) c.name = `${c.name} ${version}`;
    return Response.json({ ...file, version });
  }) as typeof fetch;
}

/** A CDN that answers nothing, like a real request, until its timeout (if any) aborts it. */
const hung = ((_input: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  })) as typeof fetch;

/** A CDN held back until `open()`. */
function held(behind: typeof fetch) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const fetchFn = (async (...args: Parameters<typeof fetch>) => {
    await gate;
    return behind(...args);
  }) as typeof fetch;
  return { fetchFn, open };
}

const offline = (async () => {
  throw new TypeError("fetch failed");
}) as typeof fetch;

/** A cache folder holding this patch, as an earlier run of the panel leaves it. */
async function cacheOf(version: string): Promise<string> {
  const cacheDir = tmp("ldc-sn-");
  await new DataDragon({ cacheDir, fetch: cdn(version) }).load();
  return cacheDir;
}

class FakeConnector extends EventEmitter {
  credentials = null;
  status = "searching";
  start = vi.fn();
  stop(): void {}
}

function handCoach(fetchFn: typeof fetch, cacheDir = tmp("ldc-sn-"), requestTimeoutMs?: number) {
  const connector = new FakeConnector();
  const ddragon = new DataDragon({ cacheDir, fetch: fetchFn, ...(requestTimeoutMs ? { requestTimeoutMs } : {}) });
  const coach = new Coach({ connector: connector as unknown as LcuConnector, ddragon });
  return { coach, connector, ddragon };
}
const keys = (c: Coach) => c.state.notices.map((n) => n.key);

beforeEach(() => vi.mocked(logProblem).mockClear());

describe("starting with a slow or hung network", () => {
  it("connects to the client with the cached patch while Data Dragon never answers", async () => {
    const { coach, connector, ddragon } = handCoach(hung, await cacheOf("9.9.1"));
    await coach.start();
    expect(connector.start).toHaveBeenCalledOnce();
    expect(coach.state.status.patch).toBe("9.9.1");
    expect(ddragon.champion(103)?.name).toBe("Ahri 9.9.1");
    expect(keys(coach)).toEqual([]);
  });

  it("connects with no cache and no answer, then fills in the data when it arrives", async () => {
    const cdnHeld = held(cdn("9.9.1"));
    const { coach, connector, ddragon } = handCoach(cdnHeld.fetchFn);
    await coach.start();
    expect(connector.start).toHaveBeenCalledOnce();
    expect(coach.state.status.patch).toBeNull();
    expect(ddragon.loaded).toBe(false);
    expect(keys(coach)).toEqual([]); // still loading: nothing has failed
    cdnHeld.open();
    await waitFor(() => coach.state.status.patch === "9.9.1");
    expect(ddragon.champion(103)?.name).toBe("Ahri 9.9.1");
  });

  it("applies a new patch when it arrives, over the cached one", async () => {
    const cacheDir = await cacheOf("9.9.1");
    const cdnHeld = held(cdn("9.10.1"));
    const { coach, ddragon } = handCoach(cdnHeld.fetchFn, cacheDir);
    const patches: (string | null)[] = [];
    coach.on("state", (s) => patches.push(s.status.patch));
    await coach.start();
    expect(coach.state.status.patch).toBe("9.9.1");
    cdnHeld.open();
    await waitFor(() => coach.state.status.patch === "9.10.1");
    expect(ddragon.champion(103)?.name).toBe("Ahri 9.10.1");
    expect([...new Set(patches)]).toEqual(["9.9.1", "9.10.1"]);
    // The next start begins from the new patch.
    const next = handCoach(hung, cacheDir);
    await next.coach.start();
    expect(next.coach.state.status.patch).toBe("9.10.1");
  });

  it("re-downloads a corrupt cache, connecting first", async () => {
    const cacheDir = await cacheOf("9.9.1");
    writeFileSync(join(cacheDir, "9.9.1_en_US", "champion.json"), '{"version":');
    const cdnHeld = held(cdn("9.9.1"));
    const { coach, connector } = handCoach(cdnHeld.fetchFn, cacheDir);
    await coach.start();
    expect(connector.start).toHaveBeenCalledOnce();
    expect(coach.state.status.patch).toBeNull();
    cdnHeld.open();
    await waitFor(() => coach.state.status.patch === "9.9.1");
    expect(keys(coach)).toEqual([]);
  });
});

describe("a failed load", () => {
  it("with no data shows the notice after the timeout, and the next champ select tries again", async () => {
    let answering: typeof fetch = hung;
    const { coach, connector } = handCoach(((...a: Parameters<typeof fetch>) => answering(...a)) as typeof fetch, tmp("ldc-sn-"), 20);
    await coach.start();
    await waitFor(() => keys(coach).length > 0);
    expect(keys(coach)).toEqual(["championData"]);
    expect(vi.mocked(logProblem).mock.calls[0]![0]).toMatch(/didn't answer/);
    answering = cdn("9.9.1");
    connector.emit("gameflowPhase", "ChampSelect");
    await waitFor(() => keys(coach).length === 0);
    expect(coach.state.status.patch).toBe("9.9.1");
  });

  it("with the last patch on screen says nothing, and the next champ select still looks for the new one", async () => {
    let answering: typeof fetch = offline;
    const { coach, connector } = handCoach(((...a: Parameters<typeof fetch>) => answering(...a)) as typeof fetch, await cacheOf("9.9.1"));
    await coach.start();
    await waitFor(() => vi.mocked(logProblem).mock.calls.length > 0);
    expect(keys(coach)).toEqual([]);
    expect(coach.state.status.patch).toBe("9.9.1");
    answering = cdn("9.10.1");
    connector.emit("gameflowPhase", "ChampSelect");
    await waitFor(() => coach.state.status.patch === "9.10.1");
  });

  it("logs once, however many champ selects fail", async () => {
    const { coach, connector } = handCoach(offline);
    await coach.start();
    await waitFor(() => keys(coach).length > 0);
    connector.emit("gameflowPhase", "ChampSelect");
    await new Promise((r) => setTimeout(r, 30));
    expect(logProblem).toHaveBeenCalledOnce();
  });
});

describe("the whole coach before names and icons have arrived", () => {
  let server: MockLcuServer | null = null;
  let coach: PersonalCoach | null = null;
  afterEach(async () => {
    coach?.stop();
    await server?.stop();
    server = coach = null;
  });

  it("coaches the draft from the first frame and swaps in the names when they load", async () => {
    server = new MockLcuServer(loadFixture("synthetic-draft-pick"), {
      "/lol-summoner/v1/current-summoner": { puuid: CLIENT_PUUID, gameName: "Me", tagLine: "EUW" },
    });
    const creds = await server.start();
    const matchesDir = tmp("ldc-sn-");
    const riot = new RiotApi({ apiKey: "test", keyType: "development", platform: "euw1", region: "europe", fetch: fakeRiotFetch().fetchFn });
    const cdnHeld = held(cdn("9.9.1"));
    coach = new PersonalCoach({
      connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-sn-"), fetch: cdnHeld.fetchFn }),
      config,
      profiles: new DirectProfileSource({ riot, history: config.app.history, bands: config.bands, storeFor: (puuid) => new MatchStore(matchesDir, puuid) }),
      riotId: null,
    });
    await coach.start();

    await waitFor(() => coach!.state.status.profile.state === "ready" && server!.clientCount === 1);
    await stepUntil(server, coach, () => coach!.state.draft?.localAction === "pick");
    await waitFor(() => coach!.state.picks.length > 0);
    expect(coach.state.status.patch).toBeNull();
    const ahri = () => coach!.state.picks.find((p) => p.champion.id === 103)!.champion;
    expect(ahri()).toMatchObject({ name: "#103", iconUrl: null });
    const inPool = () => coach!.state.roles[0]!.pool.find((c) => c.champion.id === 103)!.champion;
    expect(inPool().name).toBe("#103");

    cdnHeld.open();
    await waitFor(() => coach!.state.status.patch === "9.9.1");
    expect(ahri()).toMatchObject({ name: "Ahri 9.9.1", iconUrl: expect.stringContaining("Ahri.png") });
    expect(inPool().name).toBe("Ahri 9.9.1");
    expect(JSON.stringify(coach.state.draft)).not.toContain('"#103"');
  });
});
