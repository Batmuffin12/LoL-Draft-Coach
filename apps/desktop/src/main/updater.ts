import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { autoUpdater } from "electron-updater";

/** How often a running app looks for a new version. Updates live on GitHub, so this never wakes the coach server. */
export const UPDATE_CHECK_EVERY_MS = 6 * 60 * 60_000;

/**
 * Checks for a new version in the background, at launch and then periodically, and installs it
 * on the next quit (or at once with restartToUpdate). Only in packaged builds that were built with an update location (LDC_UPDATE_URL),
 * which electron-builder writes to resources/app-update.yml.
 */
export function startAutoUpdate(onReady: (version: string) => void): void {
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, "app-update.yml"))) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => onReady(info.version));
  autoUpdater.on("error", () => {
    // Offline or the release isn't published yet: try again at the next check.
  });
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_CHECK_EVERY_MS).unref();
}

/** Installs the downloaded version and starts it again, without the installer's screens. */
export function restartToUpdate(): void {
  autoUpdater.quitAndInstall(true, true);
}
