/**
 * Electron main process. Uses only standard Electron APIs so the app can move to
 * ow-electron (Overwolf's Electron build) later without code changes here.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { DataDragon } from "@ldc/ddragon";
import { discoverCredentials, LcuConnector, type LcuCredentials } from "@ldc/lcu";
import { RiotApi } from "@ldc/riot-api";
import { IPC, type ViewState } from "../shared/view";
import type { Coach } from "./coach";
import { findConfigDir, loadConfig } from "./config";
import { MatchStore } from "./match-store";
import { PersonalCoach } from "./personal-coach";
import { computeDockBounds, createWin32Finder, sameRect, type Rect } from "./dock";
import { loadEnv, type AppEnv } from "./env";

const PANEL_WIDTH = 340;
const DOCK_POLL_MS = 500;

/** Loaded .env, or the reason it couldn't be used (shown to the user, then the app quits). */
const envResult = ((): { env: AppEnv } | { error: Error } => {
  try {
    return { env: loadEnv(app.getAppPath()) };
  } catch (err) {
    return { error: err as Error };
  }
})();

let win: BrowserWindow | null = null;
let latest: ViewState | null = null;

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: PANEL_WIDTH,
    height: 720,
    minWidth: 280,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: "#0b0f17",
    title: "LoL Draft Coach",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  w.once("ready-to-show", () => w.show());
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void w.loadURL(devUrl);
  else void w.loadFile(join(__dirname, "../renderer/index.html"));
  // Never navigate away or open new windows from the panel.
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return w;
}

async function startDocking(coach: Coach): Promise<void> {
  const finder = await createWin32Finder();
  if (!finder) return;
  let last: Rect | null = null;
  setInterval(() => {
    if (!win || win.isDestroyed() || !coach.state.docked) return;
    const physical = finder.find();
    if (!physical) return;
    // GetWindowRect returns physical pixels; Electron positions windows in DIPs.
    const client = process.platform === "win32" ? screen.screenToDipRect(null, physical) : physical;
    const display = screen.getDisplayMatching(client);
    const target = computeDockBounds(client, PANEL_WIDTH, display.workArea);
    if (!sameRect(target, last)) {
      win.setBounds(target);
      last = target;
    }
  }, DOCK_POLL_MS);
}

/** Dev aid: LDC_LCU_OVERRIDE="port:password" points the app at the mock client (pnpm --filter @ldc/lcu mock). */
function overrideCredentials(): LcuCredentials | null {
  const m = /^(\d+):(.+)$/.exec(process.env.LDC_LCU_OVERRIDE ?? "");
  return m ? { port: Number(m[1]), password: m[2]!, protocol: "https" } : null;
}

/** Dev aid: LDC_SCREENSHOT=path.png saves a screenshot of the panel after a delay and quits. */
function scheduleScreenshot(): void {
  const path = process.env.LDC_SCREENSHOT;
  if (!path) return;
  setTimeout(async () => {
    const image = await win?.webContents.capturePage();
    if (image) await writeFile(path, image.toPNG());
    app.quit();
  }, Number(process.env.LDC_SCREENSHOT_DELAY_MS ?? 8_000));
}

async function main(): Promise<void> {
  await app.whenReady();
  if ("error" in envResult) {
    // A broken .env is a setup problem: say exactly what to fix.
    dialog.showErrorBox("LoL Draft Coach: check your .env", envResult.error.message);
    app.quit();
    return;
  }
  const { env } = envResult;

  const override = overrideCredentials();
  const connector = new LcuConnector({
    discover: async () => override ?? discoverCredentials({ installDir: env.lolInstallDir }),
  });
  const ddragon = new DataDragon({ cacheDir: join(app.getPath("userData"), "ddragon") });
  const config = loadConfig(findConfigDir(app.getAppPath(), process.resourcesPath));
  // Interim (until apps/server exists in milestone 3): the key is read here in the main
  // process from the local .env and never sent to the renderer.
  const riot = env.riotApiKey
    ? new RiotApi({ apiKey: env.riotApiKey, keyType: env.riotKeyType, platform: env.riotPlatform, region: env.riotRegion })
    : null;
  const matchesDir = join(app.getPath("userData"), "matches");
  const coach = new PersonalCoach({
    connector,
    ddragon,
    config,
    riot,
    riotId: env.riotId,
    storeFor: (puuid) => new MatchStore(matchesDir, puuid),
  });

  win = createWindow();
  coach.on("state", (s) => {
    latest = s;
    if (win && !win.isDestroyed()) win.webContents.send(IPC.state, s);
  });
  ipcMain.on(IPC.ready, (e) => {
    if (latest) e.sender.send(IPC.state, latest);
  });
  ipcMain.on(IPC.setDocked, (_e, docked: unknown) => coach.setDocked(docked === true));

  await coach.start();
  void startDocking(coach);
  scheduleScreenshot();

  app.on("window-all-closed", () => {
    coach.stop();
    app.quit();
  });
}

// A second instance would fight the first over Chromium's cache folders ("Unable to move
// the cache: Access is denied"), so focus the running panel instead. Screenshot runs are
// exempt so they can work next to an open panel.
if (!process.env.LDC_SCREENSHOT && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  void main();
}
