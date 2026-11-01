import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChampionBuild } from "@ldc/shared";
import { browseLoadout, parseEngineConfig } from "../src/index";

const cfg = parseEngineConfig(JSON.parse(readFileSync(new URL("../../../config/engine.v1.json", import.meta.url), "utf8"))).loadout;

const page = (keystone: number, games: number) => ({ primaryStyle: 8000, subStyle: 8400, runes: [keystone, 2, 3, 4, 5, 6], statPerks: [5001, 5008, 5005], games, wins: games / 2, n: games });

const build: ChampionBuild = {
  championId: 1,
  role: "top",
  n: 1000,
  timelineN: 800,
  games: 1000,
  wins: 500,
  pages: [page(8010, 600), page(8005, 300)],
  spells: [{ spells: [4, 12], games: 900, wins: 450, n: 900 }],
  skills: [{ first: [1, 3, 2], order: [1, 3, 2], games: 700, wins: 350, n: 700 }],
  starting: [{ items: [1055, 2003], games: 600, wins: 300, n: 600 }],
  core: [{ items: [3071, 3053, 3065], games: 200, wins: 110, n: 200 }],
  items: [{ itemId: 3071, slot: 1, n: 400, share: 0.5, winAdded: 0.01, minute: 12 }],
  lifts: [{ kind: "item", id: 3071, trait: "magic", lift: 2, high: 0.4, low: 0.2, n: 300 }],
  matchupPages: [],
};

describe("a loadout with no draft around it", () => {
  const snapshot = { builds: [build] };

  it("is what the band takes: no enemies, your own games or other roles in it, and no trait cuts needed", () => {
    const l = browseLoadout(snapshot, 1, "top", cfg)!;
    expect(l.page?.value.runes[0]).toBe(8010);
    expect(l.pageAlt?.value.runes[0]).toBe(8005);
    expect(l.games).toBe(1000);
    expect(l.situational).toEqual([]);
    expect(l.situationalRunes).toEqual([]);
    expect(l.source).toMatchObject({ personalGames: 0, pooled: false, thin: false });
  });

  it("is null for a role without a build, and for a snapshot without builds", () => {
    expect(browseLoadout(snapshot, 1, "jungle", cfg)).toBeNull();
    expect(browseLoadout(snapshot, 2, "top", cfg)).toBeNull();
    expect(browseLoadout({}, 1, "top", cfg)).toBeNull();
  });
});
