import { Agent, request } from "node:https";

/** Where the League game serves the Live Client Data API while a game runs. */
export const LIVE_HOST = "127.0.0.1";
export const LIVE_PORT = 2999;
export const ALL_GAME_DATA = "/liveclientdata/allgamedata";

/**
 * Read-only client of the Live Client Data API (milestone 10). GET only: the app reads the game,
 * never acts in it. The game serves HTTPS on localhost with a certificate from Riot's own local
 * CA, so verification is off for this agent only (as for the LCU); nothing leaves 127.0.0.1.
 * Raw responses hold player names: pass them through `sanitizeLiveGame()` before anything else.
 */
export class LiveClientHttp {
  private readonly agent = new Agent({ rejectUnauthorized: false, keepAlive: true });

  constructor(
    private readonly host: string = LIVE_HOST,
    private readonly port: number = LIVE_PORT,
  ) {}

  /** The raw game data, or null when no game is running (refused, 404, or still loading). */
  allGameData(timeoutMs = 3_000): Promise<unknown | null> {
    return new Promise((resolve) => {
      const req = request({ host: this.host, port: this.port, path: ALL_GAME_DATA, method: "GET", agent: this.agent, timeout: timeoutMs, headers: { Accept: "application/json" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if ((res.statusCode ?? 0) !== 200) return resolve(null);
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            resolve(null);
          }
        });
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(null));
      req.end();
    });
  }
}
