import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp, openDb } from "@ldc/server";
import type { LoadedConfig } from "../src/main/config";
import { findConfigDir, loadConfig } from "../src/main/config";
import { ConfigSource, parseRemoteConfig } from "../src/main/config-source";
import { ServerClient } from "../src/main/server-client";

const bundled = loadConfig(findConfigDir(__dirname));
const cacheFile = () => join(mkdtempSync(join(tmpdir(), "ldc-cfg-")), "config", "server-config.json");

/** The real server API in-process, serving `publicConfig`; counts requests and the ETags sent. */
function server(publicConfig: Record<string, unknown>) {
  const app = createApp({ db: openDb(":memory:"), version: "test", riot: null, publicConfig });
  const etags: (string | null)[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    etags.push(new Headers(init?.headers).get("if-none-match"));
    return app.request(String(input), init);
  }) as typeof fetch;
  return { client: new ServerClient("https://coach.test", "token", fetchFn, async () => {}), etags };
}

const tuned = { ...bundled, engine: { ...bundled.engine, topN: 2, rating: { ...bundled.engine.rating, offMetaPenalty: 35 } } };

describe("ConfigSource", () => {
  it("tries again after a failed request instead of keeping old settings until the next start", async () => {
    const s = server(tuned);
    let up = false;
    const flaky = { config: (etag: string | null) => (up ? s.client.config(etag) : Promise.reject(new Error("server restarting"))) } as unknown as ServerClient;
    const src = new ConfigSource({ client: () => flaky, cacheFile: cacheFile(), log: () => {}, retryMs: 20 });
    const seen: LoadedConfig[] = [];
    src.on("config", (c) => seen.push(c));
    await src.refresh();
    expect(seen).toHaveLength(0);
    up = true;
    await new Promise((r) => setTimeout(r, 80));
    expect(seen.at(-1)?.engine.topN).toBe(2);
  });

  it("applies the server's tuning, caches it, and only downloads it again when it changes", async () => {
    const s = server(tuned);
    const file = cacheFile();
    const src = new ConfigSource({ client: () => s.client, cacheFile: file, log: () => {} });
    const seen: LoadedConfig[] = [];
    src.on("config", (c) => seen.push(c));
    await src.refresh();
    expect(seen.at(-1)?.engine.topN).toBe(2);
    expect(seen.at(-1)?.engine.rating.offMetaPenalty).toBe(35);

    await src.refresh();
    expect(seen).toHaveLength(1); // 304: nothing new
    expect(s.etags[1]).toMatch(/^"/);

    // Next start, before (or without) the server: the cached tuning is used.
    const restarted = new ConfigSource({ client: () => null, cacheFile: file, log: () => {} });
    const again: LoadedConfig[] = [];
    restarted.on("config", (c) => again.push(c));
    await restarted.loadCached();
    expect(again[0]?.engine.topN).toBe(2);
  });

  it("ignores an invalid config from the server and keeps the current one", async () => {
    const broken = { ...bundled, engine: { ...bundled.engine, topN: 0 } };
    const logs: string[] = [];
    const src = new ConfigSource({ client: () => server(broken).client, cacheFile: cacheFile(), log: (m) => logs.push(m) });
    const seen: LoadedConfig[] = [];
    src.on("config", (c) => seen.push(c));
    await src.refresh();
    expect(seen).toEqual([]);
    expect(logs[0]).toMatch(/Keeping the current scoring config/);
    expect(() => parseRemoteConfig({ engine: bundled.engine })).toThrow();
  });

  it("does nothing without a registered server", async () => {
    const src = new ConfigSource({ client: () => null, cacheFile: cacheFile(), log: () => {} });
    const seen: LoadedConfig[] = [];
    src.on("config", (c) => seen.push(c));
    await src.loadCached();
    await src.refresh();
    expect(seen).toEqual([]);
  });
});
