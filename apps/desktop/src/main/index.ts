/**
 * Electron main process. Uses only standard Electron APIs so the app can move to
 * ow-electron (Overwolf's Electron build) later without code changes here.
 */
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen } from "electron";
import { DataDragon } from "@ldc/ddragon";
import { discoverCredentials, LcuConnector, type LcuCredentials } from "@ldc/lcu";
import { RiotApi } from "@ldc/riot-api";
import type { MetaSnapshot, UserMatch } from "@ldc/shared";
import { IPC, type ViewState } from "../shared/view";
import type { Coach } from "./coach";
import { findConfigDir, loadConfig } from "./config";
import { MatchStore } from "./match-store";
import { AccountStore } from "./account-store";
import { AdviceStore } from "./advice-store";
import { ConfigSource } from "./config-source";
import { MetaSource } from "./meta-source";
import { MetaSnapshotSchema } from "./server-client";
import { PersonalCoach } from "./personal-coach";
import { DirectProfileSource, FileProfileSource, profileMode, ServerProfileSource } from "./profile-source";
import { startAutoUpdate } from "./updater";
import { computeDockBounds, createWin32Finder, dockWidth, dockZoom, PANEL_WIDTH, sameRect, type Rect } from "./dock";
import { loadEnv, type AppEnv } from "./env";

const DOCK_POLL_MS = 500;

// Dev aid: LDC_USER_DATA_DIR keeps a test run (another account, a clean first run) out of your real profile.
if (process.env.LDC_USER_DATA_DIR) app.setPath("userData", process.env.LDC_USER_DATA_DIR);

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
    minWidth: 400,
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
    // Scale the whole panel with the client (as the client scales itself): 440 × 720 beside a 720p client.
    const zoom = dockZoom(client.height);
    if (zoom !== win.webContents.getZoomFactor()) win.webContents.setZoomFactor(zoom);
    const target = computeDockBounds(client, dockWidth(zoom), display.workArea);
    if (!sameRect(target, last)) {
      win.setBounds(target);
      last = target;
    }
  }, DOCK_POLL_MS);
}

/** The server address baked into the installer (LDC_SERVER_URL at build time), if any. */
function builtInServerUrl(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(app.getAppPath(), "package.json"), "utf8")) as { ldcDefaultServerUrl?: unknown };
    return typeof pkg.ldcDefaultServerUrl === "string" ? pkg.ldcDefaultServerUrl : null;
  } catch {
    return null;
  }
}

/** Dev aid: LDC_LCU_OVERRIDE="port:password" points the app at the mock client (pnpm --filter @ldc/lcu mock). */
function overrideCredentials(): LcuCredentials | null {
  const m = /^(\d+):(.+)$/.exec(process.env.LDC_LCU_OVERRIDE ?? "");
  return m ? { port: Number(m[1]), password: m[2]!, protocol: "https" } : null;
}

/** Dev aid: LDC_META_FILE=snapshot.json (from `pnpm --filter @ldc/sim mock`) replaces the live meta. Development builds only. */
function devMetaFile(): MetaSnapshot | null {
  const file = process.env.LDC_META_FILE;
  if (!file || app.isPackaged) return null;
  const snapshot = MetaSnapshotSchema.parse(JSON.parse(readFileSync(file, "utf8"))) as MetaSnapshot;
  console.log(`LDC_META_FILE: using the meta snapshot in ${file} (${snapshot.matches} matches)`);
  return snapshot;
}

/**
 * Dev aid: LDC_SCREENSHOT=path.png saves a screenshot of the panel after a delay and quits;
 * LDC_VIEW_DUMP=path.json also saves everything the panel shows (its state), to check the numbers.
 */
function scheduleScreenshot(coach: Coach): void {
  const path = process.env.LDC_SCREENSHOT;
  if (!path) return;
  setTimeout(async () => {
    // LDC_SCREENSHOT_CLICK=Build: click the first button whose text is (or starts with) that first, e.g. to open a tab;
    // "Style>This month" clicks one after the other.
    for (const click of (process.env.LDC_SCREENSHOT_CLICK ?? "").split(">").filter(Boolean)) {
      await win?.webContents
        .executeJavaScript(
          `(() => { const t = ${JSON.stringify(click)}; const all = [...document.querySelectorAll("button")]; const b = all.find((x) => x.textContent.trim() === t) ?? all.find((x) => x.textContent.trim().startsWith(t)); b?.click(); return !!b; })()`,
        )
        .then((found: boolean) => console.log(`LDC_SCREENSHOT: clicked "${click}": ${found}`))
        .catch(() => null);
      await new Promise((r) => setTimeout(r, 400));
    }
    // Champ-select screens must fit without scrolling: report how far the scrolling area overflows.
    const overflow = await win?.webContents
      .executeJavaScript(`(() => { const s = document.querySelector(".scroll"); return s ? s.scrollHeight - s.clientHeight : 0; })()`)
      .catch(() => null);
    console.log(`LDC_SCREENSHOT: scroll overflow ${overflow}px`);
    const image = await win?.webContents.capturePage();
    if (image) await writeFile(path, image.toPNG());
    const dump = process.env.LDC_VIEW_DUMP;
    if (dump) await writeFile(dump, JSON.stringify(coach.state, null, 2));
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
  const mode = profileMode({ packaged: app.isPackaged, riotApiKey: env.riotApiKey, serverUrl: env.serverUrl });
  let profiles: DirectProfileSource | ServerProfileSource | FileProfileSource | null = null;
  const profileFile = !app.isPackaged ? process.env.LDC_PROFILE_FILE : undefined;
  if (profileFile) {
    // Dev aid: your history from a saved file, no Riot key needed.
    profiles = new FileProfileSource({
      read: async () => JSON.parse(await readFile(profileFile, "utf8")) as { matches: UserMatch[]; masteries: [] },
      advice: new AdviceStore(join(app.getPath("userData"), "advice.json")),
    });
    console.log(`LDC_PROFILE_FILE: using the saved history in ${profileFile}`);
  } else if (mode === "direct" && env.riotApiKey) {
    // Development only: the key from the local .env, used here in the main process and
    // never sent to the renderer. Packaged builds always use the coach server.
    const riot = new RiotApi({ apiKey: env.riotApiKey, keyType: env.riotKeyType, platform: env.riotPlatform, region: env.riotRegion });
    // v2: full anonymised match summaries (0.4+); the older trimmed cache is ignored.
    const matchesDir = join(app.getPath("userData"), "matches-v2");
    profiles = new DirectProfileSource({
      riot,
      history: config.app.history,
      bands: config.bands,
      storeFor: (puuid) => new MatchStore(matchesDir, puuid),
      advice: new AdviceStore(join(app.getPath("userData"), "advice.json")),
    });
  } else {
    const box = {
      encrypt: (plain: string) =>
        safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(plain).toString("base64")}` : `raw:${plain}`,
      decrypt: (sealed: string) =>
        sealed.startsWith("enc:") ? safeStorage.decryptString(Buffer.from(sealed.slice(4), "base64")) : sealed.replace(/^raw:/, ""),
    };
    profiles = new ServerProfileSource({
      accounts: new AccountStore(join(app.getPath("userData"), "account.json"), box),
      defaultServerUrl: env.serverUrl ?? builtInServerUrl(),
      outbox: new AdviceStore(join(app.getPath("userData"), "advice-outbox.json")),
    });
    await profiles.init();
  }
  // Live meta snapshots come from the coach server (none in dev-only direct mode).
  const serverProfiles = profiles instanceof ServerProfileSource ? profiles : null;
  const fixedMeta = devMetaFile();
  const meta =
    serverProfiles || fixedMeta
      ? new MetaSource({ client: () => serverProfiles?.serverClient ?? null, cacheDir: join(app.getPath("userData"), "meta"), fixed: fixedMeta ?? undefined })
      : null;
  const coach = new PersonalCoach({
    connector,
    ddragon,
    config,
    profiles,
    riotId: env.riotId,
    meta,
  });
  // Scoring config from the server (tuning without a release); the bundled copy until then.
  // Dev aid: LDC_BUNDLED_CONFIG=1 keeps this branch's config and wording against any server
  // (`pnpm local:prod`: the branch's panel on production data).
  const bundledConfig = !app.isPackaged && process.env.LDC_BUNDLED_CONFIG === "1";
  if (bundledConfig) console.log("LDC_BUNDLED_CONFIG: using this build's config, not the server's");
  if (serverProfiles && !bundledConfig) {
    const remoteConfig = new ConfigSource({ client: () => serverProfiles.serverClient, cacheFile: join(app.getPath("userData"), "config", "server-config.json") });
    remoteConfig.on("config", (c) => coach.setConfig(c));
    await remoteConfig.loadCached();
    void remoteConfig.refresh();
    serverProfiles.on("account", (a) => {
      if (a.state === "registered") void remoteConfig.refresh();
    });
    // Each champ select re-checks the scoring config (an ETag request: nothing is downloaded when
    // it's unchanged), so a server update reaches the panel without restarting the app.
    connector.on("gameflowPhase", (phase) => {
      if (phase === "ChampSelect") void remoteConfig.refresh();
    });
  }
  if (profiles instanceof ServerProfileSource) {
    const server = profiles;
    ipcMain.handle(IPC.register, async (_e, serverUrl: unknown, inviteCode: unknown) => {
      if (typeof serverUrl !== "string" || typeof inviteCode !== "string") return;
      await server.register(serverUrl, inviteCode);
    });
    ipcMain.handle(IPC.signOut, () => server.signOut());
    ipcMain.handle(IPC.deleteData, () => server.deleteData());
    // Dev aid: LDC_AUTO_REGISTER=<invite> registers with SERVER_URL once the League client is
    // logged in (it gives the Riot ID), retrying every few seconds (`pnpm local:prod` sets it).
    const invite = !app.isPackaged ? process.env.LDC_AUTO_REGISTER : undefined;
    if (invite && env.serverUrl) {
      let tries = 0;
      const timer = setInterval(() => {
        const state = server.account.state;
        if (state === "registered" || ++tries > 120) return clearInterval(timer);
        if (state === "unregistered" || state === "error") void server.register(env.serverUrl!, invite);
      }, 5_000);
    }
  }

  win = createWindow();
  coach.on("state", (s) => {
    latest = s;
    if (win && !win.isDestroyed()) win.webContents.send(IPC.state, s);
  });
  ipcMain.on(IPC.ready, (e) => {
    if (latest) e.sender.send(IPC.state, latest);
  });
  ipcMain.on(IPC.setDocked, (_e, docked: unknown) => coach.setDocked(docked === true));
  ipcMain.handle(IPC.importLoadout, (_e, kind: unknown) => (kind === "runes" || kind === "items" ? coach.importLoadout(kind) : undefined));

  await coach.start();
  startAutoUpdate((m) => coach.announce(m));
  void startDocking(coach);
  scheduleScreenshot(coach);

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
