import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEnvFile, loadEnv, readEnv } from "../src/main/env";
import { IPC } from "../src/shared/view";

const electron = vi.hoisted(() => ({
  exposed: {} as Record<string, Record<string, (...a: unknown[]) => unknown>>,
  ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), send: vi.fn(), invoke: vi.fn(async () => "answer") },
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: (name: string, api: Record<string, (...a: unknown[]) => unknown>) => (electron.exposed[name] = api) },
  ipcRenderer: electron.ipcRenderer,
}));

describe("the preload script: all the renderer gets", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import("../src/preload/index");
  });
  const api = () => electron.exposed.coach!;

  it("exposes one object and exactly these calls: no way to send anything else, no secrets, no Node", () => {
    expect(Object.keys(electron.exposed)).toEqual(["coach"]);
    expect(Object.keys(api()).sort()).toEqual([
      "close",
      "deleteData",
      "dismissNotice",
      "exploreChampion",
      "exploreGames",
      "exploreList",
      "highlightSeen",
      "importLoadout",
      "logError",
      "minimize",
      "onState",
      "register",
      "restartToUpdate",
      "retry",
      "setDocked",
      "signOut",
      "tourDone",
    ]);
    expect(Object.values(api()).every((f) => typeof f === "function")).toBe(true);
  });

  it.each([
    ["register", [BASE_URL(), "CODE"], IPC.register],
    ["signOut", [], IPC.signOut],
    ["deleteData", [], IPC.deleteData],
    ["importLoadout", ["all", "page-1"], IPC.importLoadout],
    ["retry", [], IPC.retry],
    ["exploreList", [], IPC.exploreList],
    ["exploreChampion", [103, "middle"], IPC.exploreChampion],
    ["exploreGames", [], IPC.exploreGames],
  ] as const)("%s asks the main process on its own channel, and hands back the answer", async (name, args, channel) => {
    await expect(api()[name]!(...args)).resolves.toBe("answer");
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(channel, ...args);
  });

  it.each([
    ["setDocked", [true], IPC.setDocked],
    ["restartToUpdate", [], IPC.restartToUpdate],
    ["logError", ["boom"], IPC.logError],
    ["dismissNotice", ["queue"], IPC.dismissNotice],
    ["tourDone", [], IPC.tourDone],
    ["highlightSeen", ["browse"], IPC.highlightSeen],
    ["minimize", [], IPC.minimize],
  ] as const)("%s tells the main process on its own channel", (name, args, channel) => {
    api()[name]!(...args);
    expect(electron.ipcRenderer.send).toHaveBeenCalledExactlyOnceWith(channel, ...args);
  });

  it("the state: listens, says it's ready, passes on only the state, and stops when asked", () => {
    const got: unknown[] = [];
    const stop = api().onState!((s: unknown) => got.push(s)) as () => void;
    expect(electron.ipcRenderer.send).toHaveBeenCalledExactlyOnceWith(IPC.ready);
    const [channel, listener] = electron.ipcRenderer.on.mock.calls[0] as unknown as [string, (e: unknown, s: unknown) => void];
    expect(channel).toBe(IPC.state);
    listener({ sender: "not for the renderer" }, { state: 1 });
    expect(got).toEqual([{ state: 1 }]);
    stop();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(IPC.state, listener);
  });

  function BASE_URL() {
    return "https://coach.test";
  }
});

describe(".env", () => {
  const tmp = () => mkdtempSync(join(tmpdir(), "ldc-env-"));
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it("finds the nearest .env walking up, and none when there is none", () => {
    const root = tmp();
    const deep = join(root, "a", "b");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(root, "a", ".env"), "X=1");
    expect(findEnvFile(deep)).toBe(join(root, "a", ".env"));
    writeFileSync(join(deep, ".env"), "X=2");
    expect(findEnvFile(deep)).toBe(join(deep, ".env"));
  });

  it("LDC_ENV_FILE wins, and its values are read", () => {
    const file = join(tmp(), "custom.env");
    writeFileSync(file, 'RIOT_ID="Me#EUW"\nSERVER_URL=https://coach.test\nJEV_ENABLED=true\nRIOT_KEY_TYPE=personal\n');
    process.env.LDC_ENV_FILE = file;
    for (const k of ["RIOT_ID", "SERVER_URL", "JEV_ENABLED", "RIOT_KEY_TYPE"]) delete process.env[k];
    expect(loadEnv(tmp())).toMatchObject({ riotId: "Me#EUW", serverUrl: "https://coach.test", jevEnabled: true, riotKeyType: "personal" });
  });

  it("blank values count as unset, with the defaults in their place", () => {
    expect(readEnv({ RIOT_API_KEY: "  ", RIOT_ID: "", SERVER_URL: " ", RIOT_PLATFORM: "", LOL_INSTALL_DIR: " " })).toMatchObject({ riotApiKey: null, riotId: null, serverUrl: null, riotPlatform: "euw1", riotRegion: "europe", riotKeyType: "development", jevEnabled: false });
    expect(readEnv({}).lolInstallDir).toContain("League of Legends");
  });

  it("a routing value that isn't one is refused, by name", () => {
    expect(() => readEnv({ RIOT_PLATFORM: "euw1/../x" })).toThrow(/RIOT_PLATFORM/);
    expect(() => readEnv({ RIOT_REGION: "Europe West" })).toThrow(/RIOT_REGION/);
  });
});
