import { contextBridge, ipcRenderer } from "electron";
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
  /** Writes the shown rune page and spells ("runes") or item set ("items") into the League client. Only ever called from an import button. */
  importLoadout(kind: "runes" | "items" | "all"): Promise<void> {
    return ipcRenderer.invoke(IPC.importLoadout, kind);
  },
  /** Installs the downloaded update and restarts; the main process refuses during champ select or a game. */
  restartToUpdate(): void {
    ipcRenderer.send(IPC.restartToUpdate);
  },
  /** A render error's detail, for crash reports (scrubbed in the main process). */
  reportError(detail: string): void {
    ipcRenderer.send(IPC.reportError, detail);
  },
  dismissNotice(key: string): void {
    ipcRenderer.send(IPC.dismissNotice, key);
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
