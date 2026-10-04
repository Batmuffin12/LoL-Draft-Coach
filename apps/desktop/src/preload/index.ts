import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ViewState } from "../shared/view";

/** The only API the renderer gets: receive view state, toggle docking, close. No secrets, no Node. */
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
  close(): void {
    window.close();
  },
};

export type CoachApi = typeof api;
contextBridge.exposeInMainWorld("coach", api);
