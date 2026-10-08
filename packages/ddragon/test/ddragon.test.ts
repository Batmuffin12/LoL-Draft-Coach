import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { communityDragonAsset, DataDragon, DataDragonError } from "../src/index";

/** A fake Data Dragon CDN whose newest version can be changed by the test. */
function fakeCdn() {
  const state = { versions: ["1.2.1", "1.1.1"], online: true, requests: [] as string[] };
  const files = (v: string) => ({
    champion: {
      version: v,
      data: {
        Alpha: { id: "Alpha", key: "1", name: `Alpha ${v}`, image: { full: "Alpha.png" }, info: { attack: 7, defense: 4, magic: 2, difficulty: 6 }, tags: ["Fighter", "Assassin"], extra: true },
        Beta: { id: "Beta", key: "2", name: "Beta", image: { full: "Beta.png" } },
      },
    },
    item: {
      data: {
        "1001": { name: "Boots", stats: { FlatMovementSpeedMod: 25 }, into: ["3006"], gold: { total: 300, purchasable: true }, tags: ["Boots"], maps: { "11": true, "12": false } },
        "3006": { name: "Greaves", from: ["1001"], gold: { total: 1100, purchasable: true }, image: { full: "3006.png" }, maps: { "11": true } },
        "9999": { name: "Quest reward", gold: { total: 0, purchasable: false }, inStore: false, requiredChampion: "Alpha" },
      },
    },
    runesReforged: [{ id: 8000, key: "Precision", name: "Precision", icon: "perk-images/Styles/7201_Precision.png", slots: [{ runes: [{ id: 8005, name: "Press the Attack", icon: "pta.png" }] }] }],
    summoner: { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", image: { full: "SummonerFlash.png" } } } },
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

describe("communityDragonAsset", () => {
  it("maps a client game-data icon path to the public mirror, lower-cased", () => {
    expect(communityDragonAsset("/lol-game-data/assets/v1/perk-images/StatMods/StatModsAdaptiveForceIcon.png")).toBe(
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/statmodsadaptiveforceicon.png",
    );
    expect(communityDragonAsset("/other/thing.png")).toBeNull();
  });
});

describe("DataDragon", () => {
  it("uses the newest version from versions.json and builds champion info", async () => {
    const cdn = fakeCdn();
    const dd = new DataDragon({ cacheDir, fetch: cdn.fetchFn, baseUrl: "https://cdn.test" });
    expect(await dd.load()).toBe(true);
    expect(dd.data.version).toBe("1.2.1");
    expect(dd.champion(1)).toEqual({ id: 1, key: "Alpha", name: "Alpha 1.2.1", iconUrl: "https://cdn.test/cdn/1.2.1/img/champion/Alpha.png", info: { attack: 7, defense: 4, magic: 2, difficulty: 6 }, tags: ["Fighter", "Assassin"] });
    expect(dd.data.champions.size).toBe(2);
    expect(dd.data.summonerSpells.data.SummonerFlash?.name).toBe("Flash");
  });

  it("builds item, rune and summoner spell info by numeric id", async () => {
    const dd = new DataDragon({ cacheDir, fetch: fakeCdn().fetchFn, baseUrl: "https://cdn.test" });
    await dd.load();
    expect(dd.data.itemInfo.get(1001)).toMatchObject({ gold: 300, into: [3006], from: [], tags: ["Boots"], maps: ["11"], purchasable: true, requiredChampion: null });
    expect(dd.data.itemInfo.get(3006)).toMatchObject({ from: [1001], iconUrl: "https://cdn.test/cdn/1.2.1/img/item/3006.png" });
    expect(dd.data.itemInfo.get(9999)).toMatchObject({ purchasable: false, requiredChampion: "Alpha" });
    expect(dd.data.runeInfo.get(8005)).toEqual({ id: 8005, name: "Press the Attack", iconUrl: "https://cdn.test/cdn/img/pta.png", styleId: 8000 });
    expect(dd.data.runeInfo.get(8000)?.styleId).toBe(8000);
    expect(dd.data.spellInfo.get(4)).toEqual({ id: 4, name: "Flash", iconUrl: "https://cdn.test/cdn/1.2.1/img/spell/SummonerFlash.png" });
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

describe("stat shards (CommunityDragon)", () => {
  const styles = { schemaVersion: 2, styles: [{ id: 8000, slots: [{ type: "kKeyStone", perks: [8005] }, { type: "kStatMod", perks: [5008, 5005, 5007] }, { type: "kStatMod", perks: [5011, 5013, 5001] }] }] };
  const perks = [
    { id: 5008, name: "Adaptive Force", iconPath: "/lol-game-data/assets/v1/perk-images/StatMods/StatModsAdaptiveForceIcon.png" },
    { id: 5011, name: "Health", iconPath: "/lol-game-data/assets/v1/perk-images/StatMods/StatModsHealthScalingIcon.png" },
    { id: 8005, name: "Press the Attack", iconPath: "" },
  ];
  const withShards = (cdn: ReturnType<typeof fakeCdn>) =>
    (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("v1/perkstyles.json")) return cdn.state.online ? Response.json(styles) : Promise.reject(new TypeError("fetch failed"));
      if (url.endsWith("v1/perks.json")) return cdn.state.online ? Response.json(perks) : Promise.reject(new TypeError("fetch failed"));
      return cdn.fetchFn(input);
    }) as typeof fetch;

  it("reads the shard rows and names, and keeps them for offline use", async () => {
    const cdn = fakeCdn();
    const dd = new DataDragon({ cacheDir, fetch: withShards(cdn) });
    expect(await dd.statShards()).toBeNull(); // not loaded yet
    await dd.load();
    const s = (await dd.statShards())!;
    expect(s.rows).toEqual([[5008, 5005, 5007], [5011, 5013, 5001]]);
    expect(s.perks.get(5008)?.name).toBe("Adaptive Force");
    expect(s.perks.get(5008)?.iconUrl).toContain("perk-images/statmods/");
    expect(s.perks.has(8005)).toBe(false);

    cdn.state.online = false;
    const offline = new DataDragon({ cacheDir, fetch: withShards(cdn) });
    await offline.load();
    expect((await offline.statShards())?.rows).toHaveLength(2);
  });

  it("is null when CommunityDragon is unreachable and nothing is cached", async () => {
    const dd = new DataDragon({ cacheDir, fetch: fakeCdn().fetchFn });
    await dd.load();
    expect(await dd.statShards()).toBeNull();
  });
});
