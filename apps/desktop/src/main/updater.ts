import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * Checks for a new version in the background and installs it on the next quit.
 * Only in packaged builds that were built with an update location (LDC_UPDATE_URL),
 * which electron-builder writes to resources/app-update.yml.
 */
export function startAutoUpdate(onMessage: (message: string) => void): void {
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, "app-update.yml"))) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => onMessage(`Version ${info.version} is ready and installs when you close the app.`));
  autoUpdater.on("error", () => {
    // Offline or the release isn't published yet: try again on the next start.
  });
  void autoUpdater.checkForUpdates().catch(() => {});
}
