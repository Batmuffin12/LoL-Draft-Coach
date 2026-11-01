import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { Coach } from "../src/main/coach";
import { findConfigDir, loadConfig } from "../src/main/config";
import { logProblem } from "../src/main/problem-log";
import { PersonalCoach } from "../src/main/personal-coach";
import { fakeDdragonFetch, waitFor } from "./helpers";

vi.mock("../src/main/problem-log", () => ({ logProblem: vi.fn() }));

const config = loadConfig(findConfigDir(__dirname));
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const keys = (c: Coach) => c.state.notices.map((n) => n.key);

/** A coach on a connector the test drives by hand. */
class FakeConnector extends EventEmitter {
  credentials = null;
  status = "searching";
  start(): void {}
  stop(): void {}
}
function handCoach(fetchFn: typeof fetch = fakeDdragonFetch()) {
  const connector = new FakeConnector();
  const ddragon = new DataDragon({ cacheDir: tmp("ldc-n-"), fetch: fetchFn });
  const coach = new Coach({ connector: connector as unknown as LcuConnector, ddragon });
  return { coach, connector };
}

beforeEach(() => vi.mocked(logProblem).mockClear());

describe("Coach notices", () => {
  it("says a schema problem in plain words, logs the detail, and clears when good data comes", async () => {
    const { coach, connector } = handCoach();
    await coach.start();
    const zod = new Error("Unexpected data from /lol-champ-select/v1/session:\n✖ Invalid input");
    connector.emit("schemaError", zod);
    connector.emit("schemaError", zod);
    expect(coach.state.notices).toHaveLength(1);
    expect(coach.state.notices[0]!.text).not.toMatch(/lol-champ-select|Invalid input/);
    expect(logProblem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logProblem).mock.calls[0]![0]).toMatch(/lol-champ-select/);
    connector.emit("champSelect", null);
    expect(coach.state.notices).toEqual([]);
  });

  it("clears a schema problem when the client goes away", async () => {
    const { coach, connector } = handCoach();
    await coach.start();
    connector.emit("schemaError", new Error("x"));
    connector.emit("status", "disconnected");
    expect(coach.state.notices).toEqual([]);
  });

  it("keeps a dismissed notice away until its cause has ended, then it can come back", async () => {
    const { coach, connector } = handCoach();
    await coach.start();
    connector.emit("schemaError", new Error("x"));
    coach.dismissNotice("schema");
    expect(coach.state.notices).toEqual([]);
    connector.emit("schemaError", new Error("x"));
    expect(coach.state.notices).toEqual([]);
    connector.emit("champSelect", null); // the cause ended
    connector.emit("schemaError", new Error("x"));
    expect(keys(coach)).toEqual(["schema"]);
  });

  it("ignores dismissing a notice that isn't there", async () => {
    const { coach } = handCoach();
    await coach.start();
    const before = coach.state;
    coach.dismissNotice("nothing");
    expect(coach.state).toBe(before);
  });

  it("tries champion data again at the next champ select and clears the notice when it loads", async () => {
    const good = fakeDdragonFetch();
    let online = false;
    const { coach, connector } = handCoach(((...a: Parameters<typeof fetch>) => (online ? good(...a) : Promise.reject(new Error("fetch failed at https://ddragon")))) as typeof fetch);
    await coach.start();
    expect(keys(coach)).toEqual(["championData"]);
    expect(coach.state.notices[0]!.text).not.toMatch(/fetch failed|ddragon/);
    expect(vi.mocked(logProblem).mock.calls[0]![0]).toMatch(/fetch failed/);
    connector.emit("gameflowPhase", "Lobby");
    expect(keys(coach)).toEqual(["championData"]);
    online = true;
    connector.emit("gameflowPhase", "ChampSelect");
    await waitFor(() => coach.state.notices.length === 0);
    expect(coach.state.status.patch).toBe("9.9.1");
  });
});

describe("PersonalCoach notices (mock League client)", () => {
  let server: MockLcuServer | null = null;
  let coach: PersonalCoach | null = null;
  afterEach(async () => {
    coach?.stop();
    await server?.stop();
  });

  const SESSION = "/lol-champ-select/v1/session";
  const GAMEFLOW = "/lol-gameflow/v1/session";
  const session = loadFixture("synthetic-draft-pick").snapshots[SESSION];
  async function start(overrides: Record<string, unknown>) {
    server = new MockLcuServer(loadFixture("synthetic-draft-pick"), overrides);
    const creds = await server.start();
    coach = new PersonalCoach({
      connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-n-"), fetch: fakeDdragonFetch() }),
      config,
      profiles: null,
      riotId: null,
    });
    await coach.start();
  }
  const queue = (id: number) => ({ phase: "ChampSelect", gameData: { queue: { id } } });

  it("drops 'queue not supported' when that draft ends, and doesn't carry it into a ranked draft", async () => {
    await start({ [GAMEFLOW]: queue(1700), "/lol-summoner/v1/current-summoner": null, "/lol-ranked/v1/current-ranked-stats": null });
    await waitFor(() => keys(coach!).includes("queue"));
    expect(coach!.state.notices[0]!.text).toMatch(/isn't supported yet/);
    // The empty card has to say why too: the notice can be dismissed.
    expect(coach!.state.unsupportedQueue).toBe(true);

    server!.push(SESSION, null, "Delete");
    await waitFor(() => coach!.state.draft === null);
    expect(keys(coach!)).toEqual([]);
    expect(coach!.state.unsupportedQueue).toBe(false);

    server!.push(GAMEFLOW, queue(420));
    server!.push(SESSION, session);
    await waitFor(() => coach!.state.draft !== null);
    await new Promise((r) => setTimeout(r, 100));
    expect(keys(coach!)).toEqual([]);
    expect(coach!.state.unsupportedQueue).toBe(false);
  });

  it("shows it again for the next unsupported draft even if you dismissed it", async () => {
    await start({ [GAMEFLOW]: queue(1700), "/lol-summoner/v1/current-summoner": null, "/lol-ranked/v1/current-ranked-stats": null });
    await waitFor(() => keys(coach!).includes("queue"));
    coach!.dismissNotice("queue");
    expect(keys(coach!)).toEqual([]);
    server!.push(SESSION, null, "Delete");
    await waitFor(() => coach!.state.draft === null);
    server!.push(SESSION, session);
    await waitFor(() => keys(coach!).includes("queue"));
  });
});

describe("PersonalCoach import clicks that can't write anything", () => {
  const fakeConnector = () => Object.assign(new FakeConnector(), { credentials: null }) as unknown as LcuConnector;
  const make = (over: Partial<typeof config.app.import> = {}) =>
    new PersonalCoach({
      connector: fakeConnector(),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-n-"), fetch: fakeDdragonFetch() }),
      config: { ...config, app: { ...config.app, import: { ...config.app.import, ...over } } },
      profiles: null,
      riotId: null,
    });
  const texts = (c: Coach) => c.state.notices.map((n) => n.text);

  it("says import works during champ select when there's no card any more", async () => {
    const c = make();
    await c.importLoadout("all");
    expect(texts(c)).toEqual(["Import works during champ select"]);
  });

  it("says so when import is switched off", async () => {
    const c = make({ enabled: false });
    await c.importLoadout("all");
    expect(texts(c)).toEqual(["Import is switched off"]);
  });

  it("says the client isn't connected, as a failure on the card", async () => {
    const c = make();
    (c as unknown as { imports: { shown: unknown } }).imports.shown = { loadout: {}, champion: "Ahri" };
    await c.importLoadout("all");
    expect((c as unknown as { imports: { lines: unknown } }).imports.lines).toEqual([{ text: "The League client isn't connected: open it, then import again", failed: true }]);
  });
});

describe("the renderer's notices", () => {
  it("every notice wording exists in the explain config", () => {
    for (const id of ["dismiss", "schema", "championData", "clientAccount", "queue"]) expect(config.explain.templates[`ui.notice.${id}`], id).toBeTruthy();
  });
});
