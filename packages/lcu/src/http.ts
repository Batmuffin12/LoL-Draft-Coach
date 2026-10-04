import { request, Agent } from "node:https";
import type { LcuCredentials } from "./credentials";

export const LCU_HOST = "127.0.0.1";

export function basicAuth(creds: LcuCredentials): string {
  return `Basic ${Buffer.from(`riot:${creds.password}`).toString("base64")}`;
}

/**
 * The LCU serves HTTPS on localhost with a certificate signed by Riot's own local CA,
 * which isn't in the system trust store. We only ever connect to 127.0.0.1 with the
 * per-session password, so certificate verification is disabled for this agent only.
 */
export function createLocalAgent(): Agent {
  return new Agent({ rejectUnauthorized: false, keepAlive: true });
}

export class LcuHttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`LCU GET ${path} failed with HTTP ${status}`);
  }
}

/**
 * Read-only LCU client. It exposes GET only: the app never acts on champ select
 * (no auto-pick, auto-ban or auto-lock), so there is intentionally no POST/PATCH/PUT.
 */
export class LcuHttp {
  private readonly agent = createLocalAgent();

  constructor(
    private readonly creds: LcuCredentials,
    private readonly host: string = LCU_HOST,
  ) {}

  /** GETs a JSON endpoint. Returns null on 404 (e.g. no champ select in progress). */
  get(path: string, timeoutMs = 5_000): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: this.host,
          port: this.creds.port,
          path,
          method: "GET",
          agent: this.agent,
          headers: { Authorization: basicAuth(this.creds), Accept: "application/json" },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status === 404) return resolve(null);
            if (status < 200 || status >= 300) return reject(new LcuHttpError(status, path));
            const text = Buffer.concat(chunks).toString("utf8");
            try {
              resolve(text.length ? JSON.parse(text) : null);
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`LCU GET ${path} timed out`)));
      req.on("error", reject);
      req.end();
    });
  }

  close(): void {
    this.agent.destroy();
  }
}
