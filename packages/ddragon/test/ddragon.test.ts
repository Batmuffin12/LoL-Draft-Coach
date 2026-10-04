import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DataDragon, DataDragonError } from "../src/index";

/** A fake Data Dragon CDN whose newest version can be changed by the test. */
function fakeCdn() {
  const state = { versions: ["1.2.1", "1.1.1"], online: true, requests: [] as string[] };
  const files = (v: string) => ({
    champion: {
      version: v,
      data: {
        Alpha: { id: "Alpha", key: "1", name: `Alpha ${v}`, image: { full: "Alpha.png" }, extra: true },
        Beta: { id: "Beta", key: "2", name: "Beta", image: { full: "Beta.png" } },
      },
    },
    item: { data: { "1001": { name: "Boots", stats: { FlatMovementSpeedMod: 25 } } } },
    runesReforged: [{ id: 8000, key: "Precision", name: "Precision", slots: [] }],
    summoner: { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash" } } },
  });
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    state.requests.push(url);
    if (!state.online) throw new TypeError("fetch failed");
    if (url.endsWith("/api/versions.json")) return Response.json(state.versions);
    const m = /\/cdn\/([^/]+)\/data\/en_US\/(\w+)\.json$/.exec(url);
    if (!m) return new Response("not found", { status: 404 });
    const body = (files(m[1]!) as Record<string, unknown>)[m[2]!];
    return body ? Response.json(body) : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { state, fetchFn };
}

let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "ldc-dd-"));
});

describe("DataDragon", () => {
  it("uses the newest version from versions.json and builds champion info", async () => {
    const cdn = fakeCdn();
    const dd = new DataDragon({ cacheDir, fetch: cdn.fetchFn, baseUrl: "https://cdn.test" });
    expect(await dd.load()).toBe(true);
    expect(dd.data.version).toBe("1.2.1");
    expect(dd.champion(1)).toEqual({ id: 1, key: "Alpha", name: "Alpha 1.2.1", iconUrl: "https://cdn.test/cdn/1.2.1/img/champion/Alpha.png" });
    expect(dd.data.champions.size).toBe(2);
    expect(dd.data.summonerSpells.data.SummonerFlash?.name).toBe("Flash");
  });

  it("does not re-download when the cache is current", async () => {
    const cdn = fakeCdn();
    await new DataDragon({ cacheDir, fetch: cdn.fetchFn }).load();
    cdn.state.requests.length = 0;
    const dd = new DataDragon({ cacheDir, fetch: cdn.fetchFn });
    expect(await dd.load()).toBe(false);
    expect(cdn.state.requests).toHaveLength(1); // versions.json only
    expect(dd.data.version).toBe("1.2.1");
  });

  it("refreshes all static data when a new patch appears and emits 'patch'", async () => {
    const cdn = fakeCdn();
    const dd = new DataDragon({ cacheDir, fetch: cdn.fetchFn });
    await dd.load();
    const patches: string[] = [];
    dd.on("patch", (d) => patches.push(d.version));

    cdn.state.versions = ["1.3.1", ...cdn.state.versions];
    expect(await dd.load()).toBe(true);
    expect(patches).toEqual(["1.3.1"]);
    expect(dd.champion(1)?.name).toBe("Alpha 1.3.1");
    expect(cdn.state.requests.filter((u) => u.includes("/cdn/1.3.1/"))).toHaveLength(4);
    // Old patch pruned from the cache.
    expect(readdirSync(cacheDir).sort()).toEqual(["1.3.1_en_US", "current.json"]);
  });

  it("works offline from the cache", async () => {
    const cdn = fakeCdn();
    await new DataDragon({ cacheDir, fetch: cdn.fetchFn }).load();
    cdn.state.online = false;
    const dd = new DataDragon({ cacheDir, fetch: cdn.fetchFn });
    expect(await dd.load()).toBe(false);
    expect(dd.data.version).toBe("1.2.1");
  });

  it("fails clearly when offline with no cache", async () => {
    const cdn = fakeCdn();
    cdn.state.online = false;
    await expect(new DataDragon({ cacheDir, fetch: cdn.fetchFn }).load()).rejects.toBeInstanceOf(DataDragonError);
  });

  it("fails clearly when a file changes shape", async () => {
    const cdn = fakeCdn();
    const broken = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("champion.json")) return Response.json({ version: "x", data: { A: { id: "A" } } });
      return cdn.fetchFn(input);
    }) as typeof fetch;
    await expect(new DataDragon({ cacheDir, fetch: broken }).load()).rejects.toThrow(/champion\.json changed shape/);
  });
});
