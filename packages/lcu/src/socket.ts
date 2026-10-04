import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { LcuCredentials } from "./credentials";
import { basicAuth, LCU_HOST } from "./http";

/** WAMP 1.0 opcodes used by the LCU WebSocket. */
export const WAMP = { SUBSCRIBE: 5, UNSUBSCRIBE: 6, EVENT: 8 } as const;

export interface LcuEvent {
  uri: string;
  eventType: string;
  data: unknown;
}

/** `/lol-champ-select/v1/session` → `OnJsonApiEvent_lol-champ-select_v1_session`. */
export function eventNameForPath(path: string): string {
  return `OnJsonApiEvent${path.replaceAll("/", "_")}`;
}

/** Parses a raw WAMP frame; returns the event for opcode 8 frames, null otherwise. */
export function parseWampMessage(raw: string): LcuEvent | null {
  if (!raw) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(msg) || msg[0] !== WAMP.EVENT) return null;
  const payload = msg[2] as Partial<LcuEvent> | undefined;
  if (!payload || typeof payload.uri !== "string") return null;
  return { uri: payload.uri, eventType: String(payload.eventType ?? ""), data: payload.data ?? null };
}

/** Read-only WebSocket subscription to LCU events. */
export class LcuSocket extends EventEmitter<{ event: [LcuEvent]; close: [] }> {
  private ws: WebSocket | null = null;

  constructor(
    private readonly creds: LcuCredentials,
    private readonly host: string = LCU_HOST,
  ) {
    super();
  }

  connect(timeoutMs = 5_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${this.host}:${this.creds.port}/`, "wamp", {
        headers: { Authorization: basicAuth(this.creds) },
        rejectUnauthorized: false, // local Riot CA, see http.ts
        handshakeTimeout: timeoutMs,
      });
      this.ws = ws;
      let opened = false;
      ws.once("open", () => {
        opened = true;
        resolve();
      });
      // After opening, errors are followed by "close", which is what callers react to.
      ws.on("error", (err) => {
        if (!opened) reject(err);
      });
      ws.on("message", (raw) => {
        const event = parseWampMessage(raw.toString());
        if (event) this.emit("event", event);
      });
      ws.on("close", () => this.emit("close"));
    });
  }

  subscribe(path: string): void {
    this.ws?.send(JSON.stringify([WAMP.SUBSCRIBE, eventNameForPath(path)]));
  }

  close(): void {
    if (!this.ws) return;
    this.ws.removeAllListeners("close");
    this.ws.close();
    this.ws = null;
    this.emit("close");
  }
}
