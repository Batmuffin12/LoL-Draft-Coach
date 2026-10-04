import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { generate } from "selfsigned";
import { WebSocketServer, type WebSocket } from "ws";
import type { LcuCredentials } from "./credentials";
import type { Fixture } from "./fixture";
import { basicAuth, LCU_HOST } from "./http";
import { eventNameForPath, WAMP } from "./socket";

/**
 * A fake League client for tests: serves a fixture's GET snapshots over HTTPS and
 * replays its WebSocket frames over WAMP, one step at a time or all at once.
 * Test/dev only — it is not used by the app.
 */
export class MockLcuServer {
  readonly password = "mock-password";
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly state = new Map<string, unknown>();
  private readonly subscriptions = new Map<WebSocket, Set<string>>();
  private cursor = 0;

  constructor(
    private readonly fixture: Fixture,
    /** Extra GET responses (e.g. a fake local summoner, since fixtures are anonymised). */
    private readonly overrides: Record<string, unknown> = {},
  ) {
    this.reset();
  }

  /** Rewinds to the start of the fixture (snapshots restored, no frames played). */
  reset(): void {
    this.cursor = 0;
    this.state.clear();
    for (const [path, body] of Object.entries({ ...this.fixture.snapshots, ...this.overrides })) this.state.set(path, body);
  }

  get remainingFrames(): number {
    return this.fixture.frames.length - this.cursor;
  }

  async start(): Promise<LcuCredentials> {
    const pems = await generate([{ name: "commonName", value: "localhost" }], { keySize: 2048 });
    const expectedAuth = basicAuth({ port: 0, password: this.password, protocol: "https" });
    const server = createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
      if (req.headers.authorization !== expectedAuth) {
        res.writeHead(401).end();
        return;
      }
      const path = (req.url ?? "/").split("?")[0] ?? "/";
      if (req.method !== "GET") {
        res.writeHead(405).end();
        return;
      }
      const body = this.state.get(path);
      if (body === undefined || body === null) {
        res.writeHead(404, { "content-type": "application/json" }).end('{"httpStatus":404}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    });

    const wss = new WebSocketServer({
      server,
      verifyClient: (info: { req: { headers: Record<string, string | string[] | undefined> } }) =>
        info.req.headers.authorization === expectedAuth,
    });
    wss.on("connection", (ws) => {
      this.subscriptions.set(ws, new Set());
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as unknown[];
        if (msg[0] === WAMP.SUBSCRIBE && typeof msg[1] === "string") this.subscriptions.get(ws)?.add(msg[1]);
        if (msg[0] === WAMP.UNSUBSCRIBE && typeof msg[1] === "string") this.subscriptions.get(ws)?.delete(msg[1]);
      });
      ws.on("close", () => this.subscriptions.delete(ws));
    });

    await new Promise<void>((resolve) => server.listen(0, LCU_HOST, resolve));
    this.server = server;
    this.wss = wss;
    return { port: (server.address() as AddressInfo).port, password: this.password, protocol: "https" };
  }

  /** Number of currently subscribed WebSocket clients. */
  get clientCount(): number {
    return this.subscriptions.size;
  }

  /** Sets a GET response and broadcasts it as an Update event. */
  push(uri: string, data: unknown, eventType = "Update"): void {
    this.state.set(uri, eventType === "Delete" ? null : data);
    const frame = JSON.stringify([WAMP.EVENT, eventNameForPath(uri), { uri, eventType, data }]);
    for (const [ws, subs] of this.subscriptions) {
      if (subs.has(eventNameForPath(uri)) || subs.has("OnJsonApiEvent")) ws.send(frame);
    }
  }

  /** Replays the next recorded frame; returns false when the fixture is exhausted. */
  step(): boolean {
    const frame = this.fixture.frames[this.cursor];
    if (!frame) return false;
    this.cursor++;
    this.push(frame.uri, frame.data, frame.eventType);
    return true;
  }

  /** Replays every remaining frame, optionally keeping the recorded timing (scaled). */
  async playAll(timeScale = 0): Promise<void> {
    let last = this.fixture.frames[this.cursor]?.t ?? 0;
    while (this.remainingFrames > 0) {
      const next = this.fixture.frames[this.cursor]!;
      if (timeScale > 0) await new Promise((r) => setTimeout(r, (next.t - last) * timeScale));
      last = next.t;
      this.step();
    }
  }

  /** Simulates the client closing (drops all sockets). */
  dropClients(): void {
    for (const ws of this.subscriptions.keys()) ws.terminate();
    this.subscriptions.clear();
  }

  async stop(): Promise<void> {
    this.dropClients();
    await new Promise<void>((r) => (this.wss ? this.wss.close(() => r()) : r()));
    this.server?.closeAllConnections();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }
}
