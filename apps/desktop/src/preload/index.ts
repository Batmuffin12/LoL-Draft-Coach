import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ViewState } from "../shared/view";

/** The only API the renderer gets: view state, docking, account actions, close. No secrets, no Node. */
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
  close(): void {
    window.close();
  },
};

export type CoachApi = typeof api;
contextBridge.exposeInMainWorld("coach", api);
