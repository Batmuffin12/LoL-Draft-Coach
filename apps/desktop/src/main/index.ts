/**
 * Electron main process. Uses only standard Electron APIs so the app can move to
 * ow-electron (Overwolf's Electron build) later without code changes here.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { DataDragon } from "@ldc/ddragon";
import { discoverCredentials, LcuConnector, type LcuCredentials } from "@ldc/lcu";
import { IPC, type ViewState } from "../shared/view";
import { Coach } from "./coach";
import { computeDockBounds, createWin32Finder, sameRect, type Rect } from "./dock";
import { loadEnv } from "./env";

const PANEL_WIDTH = 340;
const DOCK_POLL_MS = 500;

const env = loadEnv(app.getAppPath());

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

  const override = overrideCredentials();
  const connector = new LcuConnector({
    discover: async () => override ?? discoverCredentials({ installDir: env.lolInstallDir }),
  });
  const ddragon = new DataDragon({ cacheDir: join(app.getPath("userData"), "ddragon") });
  const coach = new Coach({ connector, ddragon });

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

void main();
