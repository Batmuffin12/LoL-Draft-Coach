/**
 * The panel's startup round trips against a local server (server.ts runs it while its benchmark
 * server is up): the desktop's own ServerProfileSource, ConfigSource and MetaSource, as the main
 * process wires them, from "app started" until the profile, the meta and the config are in.
 * Twice: a first start (empty app profile) and the next start (same app profile, caches on disk).
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AccountStore } from "../../apps/desktop/src/main/account-store";
import { AdviceStore } from "../../apps/desktop/src/main/advice-store";
import { ConfigSource } from "../../apps/desktop/src/main/config-source";
import { MetaSource } from "../../apps/desktop/src/main/meta-source";
import { ServerProfileSource } from "../../apps/desktop/src/main/profile-source";

export interface FlowRequest {
  method: string;
  path: string;
  status: number;
  /** Decoded body bytes (Node's fetch unzips; the wire size is in the endpoint table). */
  bytes: number;
  ms: number;
}

export interface FlowRun {
  requests: FlowRequest[];
  /** App start → profile, meta and config all in (ms). */
  totalMs: number;
  /** App start → the profile event (ms). */
  profileMs: number;
}

const plain = { encrypt: (s: string) => `raw:${s}`, decrypt: (s: string) => s.replace(/^raw:/, "") };

async function start(dir: string, serverUrl: string, token: string, riotId: string, band: number): Promise<FlowRun> {
  const requests: FlowRequest[] = [];
  const counting = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const t0 = performance.now();
    const res = await fetch(input, init);
    const body = await res.arrayBuffer();
    requests.push({ method: init?.method ?? "GET", path: url.pathname + url.search.replace(/since=\d+/, "since=…"), status: res.status, bytes: body.byteLength, ms: performance.now() - t0 });
    return new Response(res.status === 204 || res.status === 304 ? null : body, { status: res.status, headers: res.headers });
  }) as typeof fetch;

  const t0 = performance.now();
  const accounts = new AccountStore(join(dir, "account.json"), plain);
  if (!(await accounts.load())) await accounts.save({ serverUrl, token, riotId });
  const profiles = new ServerProfileSource({ accounts, defaultServerUrl: serverUrl, fetch: counting, outbox: new AdviceStore(join(dir, "advice-outbox.json")), cacheFile: join(dir, "profile-matches.json") });
  await profiles.init();
  const config = new ConfigSource({ client: () => profiles.serverClient, cacheFile: join(dir, "config", "server-config.json"), retryMs: 0 });
  const meta = new MetaSource({ client: () => profiles.serverClient, cacheDir: join(dir, "meta") });
  await config.loadCached();
  const configDone = config.refresh();
  let profileMs = 0;
  const profileIn = new Promise<void>((resolve) =>
    profiles.on("profile", () => {
      profileMs = performance.now() - t0;
      resolve();
    }),
  );
  // As PersonalCoach does: the band's snapshot once the first profile is in.
  const metaDone = profileIn.then(() => meta.refresh(band));
  const [gameName, tagLine] = riotId.split("#") as [string, string];
  await profiles.load({ gameName, tagLine }, { bandFromApi: false });
  await Promise.all([configDone, profileIn, metaDone]);
  const totalMs = performance.now() - t0;
  // The match cache is written after the profile is in (not part of the start); wait for it before the next start.
  await profiles.cacheSaved();
  profiles.stop();
  return { requests, totalMs, profileMs };
}

/** A first start and the next start of the panel against `serverUrl`. */
export async function startupFlow(serverUrl: string, token: string, riotId: string, band: number, dir: string): Promise<{ first: FlowRun; next: FlowRun }> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const first = await start(dir, serverUrl, token, riotId, band);
  const next = await start(dir, serverUrl, token, riotId, band);
  return { first, next };
}
