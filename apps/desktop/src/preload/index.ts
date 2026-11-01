import { contextBridge, ipcRenderer } from "electron";
import type { HighlightId } from "../shared/ui-state";
import { IPC, type ViewState } from "../shared/view";

/** The only API the renderer gets: view state, docking, account actions, minimize, close. No secrets, no Node. */
const api = {
  onState(cb: (state: ViewState) => void): () => void {
    const listener = (_e: unknown, s: ViewState) => cb(s);
    ipcRenderer.on(IPC.state, listener);
    ipcRenderer.send(IPC.ready);
    return () => ipcRenderer.removeListener(IPC.state, listener);
  },
  setDocked(docked: boolean): void {
    ipcRenderer.send(IPC.setDocked, docked);
  },
  /** Registers this PC with the coach server; the result arrives as view state. */
  register(serverUrl: string, inviteCode: string): Promise<void> {
    return ipcRenderer.invoke(IPC.register, serverUrl, inviteCode);
  },
  signOut(): Promise<void> {
    return ipcRenderer.invoke(IPC.signOut);
  },
  deleteData(): Promise<void> {
    return ipcRenderer.invoke(IPC.deleteData);
  },
  /** Writes the rune option `pageKey` and spells ("runes") or item set ("items") into the League client. Only ever called from an import button. */
  importLoadout(kind: "runes" | "items" | "all", pageKey?: string): Promise<void> {
    return ipcRenderer.invoke(IPC.importLoadout, kind, pageKey);
  },
  /** Tries again now what failed (your games, the live meta); resolves when that is done. */
  retry(): Promise<void> {
    return ipcRenderer.invoke(IPC.retry);
  },
  /** Installs the downloaded update and restarts; the main process refuses during champ select or a game. */
  restartToUpdate(): void {
    ipcRenderer.send(IPC.restartToUpdate);
  },
  /** A render error's detail, for the local log (scrubbed in the main process). */
  logError(detail: string): void {
    ipcRenderer.send(IPC.logError, detail);
  },
  dismissNotice(key: string): void {
    ipcRenderer.send(IPC.dismissNotice, key);
  },
  /** The tour was finished or skipped: it doesn't open by itself again on this PC. */
  tourDone(): void {
    ipcRenderer.send(IPC.tourDone);
  },
  /** This first-time highlight was on screen: it won't show again on this PC. */
  highlightSeen(id: HighlightId): void {
    ipcRenderer.send(IPC.highlightSeen, id);
  },
  /** The main process minimizes: a sandboxed renderer has no way to. */
  minimize(): void {
    ipcRenderer.send(IPC.minimize);
  },
  close(): void {
    window.close();
  },
};

export type CoachApi = typeof api;
contextBridge.exposeInMainWorld("coach", api);
