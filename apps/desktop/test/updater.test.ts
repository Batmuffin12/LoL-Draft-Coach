import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updater = vi.hoisted(() => ({
  autoUpdater: { autoDownload: false, autoInstallOnAppQuit: false, on: vi.fn(), checkForUpdates: vi.fn(async () => null), quitAndInstall: vi.fn() },
}));
const electron = vi.hoisted(() => ({ app: { isPackaged: true } }));
vi.mock("electron-updater", () => updater);
vi.mock("electron", () => electron);
vi.mock("node:fs", () => ({ existsSync: () => true }));

import { restartToUpdate, startAutoUpdate, UPDATE_CHECK_EVERY_MS } from "../src/main/updater";

const { autoUpdater } = updater;

describe("auto update", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    electron.app.isPackaged = true;
    (process as { resourcesPath?: string }).resourcesPath = "resources";
  });
  afterEach(() => vi.useRealTimers());

  it("checks at launch and then periodically, not only at launch", () => {
    startAutoUpdate(() => {});
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS - 1);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it("tells the panel when a version is downloaded, and survives a failed check", async () => {
    const ready = vi.fn();
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    startAutoUpdate(ready);
    await vi.advanceTimersByTimeAsync(0);
    const downloaded = autoUpdater.on.mock.calls.find((c) => c[0] === "update-downloaded")![1] as (i: { version: string }) => void;
    downloaded({ version: "1.0.1" });
    expect(ready).toHaveBeenCalledWith("1.0.1");
  });

  it("does nothing in a development build", () => {
    electron.app.isPackaged = false;
    startAutoUpdate(() => {});
    vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS * 2);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("restarts silently into the new version", () => {
    restartToUpdate();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });
});
