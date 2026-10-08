import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLoadout, draftLoadout, MetaIndex, parseEngineConfig } from "@ldc/engine";
import { meta } from "../src/index";
import { ahriBuild, C, world } from "../scenarios/_world";

const config = parseEngineConfig(JSON.parse(readFileSync(new URL("../../../config/engine.v1.json", import.meta.url), "utf8")));

describe("synthetic meta snapshot", () => {
  it("holds the games and win rates you chose", () => {
    const s = meta({ matches: 5000 }).champion(1, "middle", { games: 400, winRate: 0.55 }).matchup(1, 2, "middle", { games: 100, winRate: 0.6 }).ban(1, 0.2).done();
    expect(s.champions[0]).toMatchObject({ championId: 1, role: "middle", games: 400, n: 400 });
    expect(s.champions[0]!.wins).toBeCloseTo(220);
    expect(s.matchups[0]).toEqual([1, "middle", 2, "middle", 100, 60, 100]);
    expect(s.bans).toEqual([{ championId: 1, bans: 1000, n: 1000 }]);
    expect(s.banMatches).toBe(5000);
  });

  it("feeds the engine: the meta index reads the rates, ban rates and builds", () => {
    const idx = new MetaIndex(world(), config.rating);
    expect(idx.metaRating(C.ahri, "middle")).toBeGreaterThan(idx.metaRating(C.yasuo, "middle"));
    expect(idx.banRate(C.zed)?.rate).toBeCloseTo(0.21);
    expect(idx.build(C.ahri, "middle")?.n).toBe(600);
  });

  it("carries what the app needs to build a loadout in a draft (trait cuts)", () => {
    const index = new MetaIndex(world(), config.rating);
    expect(index.snapshot.traitCuts).toBeTruthy();
    const draft = { timerPhase: "BAN_PICK", timeLeftMs: 0, isCustomGame: false, localCellId: 2, myTeam: [], theirTeam: [], myBans: [], theirBans: [], actions: [] };
    const live = { draft, pickable: [C.ahri], unavailable: new Set<number>(), comfort: new Map(), attributes: new Map(), intendedPositions: new Map(), role: "middle", weights: {} as never, config, index, band: 2 as const };
    expect(draftLoadout(live as never, C.ahri, config.loadout)?.page?.value.runes[0]).toBe(8112);
  });

  it("makes thin and solid builds on purpose (loadout.solidGames)", () => {
    const solidGames = config.loadout.solidGames;
    const loadout = (games: number) => {
      const build = meta().build(C.ahri, "middle", ahriBuild(games)).done().builds![0]!;
      return buildLoadout({ build, enemies: [C.zed], laneOpponent: C.zed, attributes: new Map(), traitCuts: { magic: 0.5, physical: 0.5, frontline: 0.5, engage: 0.5, heal: 0.5 }, config: config.loadout });
    };
    expect(loadout(solidGames * 3).source.thin).toBe(false);
    expect(loadout(Math.floor(solidGames / 3)).source.thin).toBe(true);
    // Solid data gives a page and spells with their share of the games.
    const solid = loadout(solidGames * 3);
    expect(solid.page?.value.runes[0]).toBe(8112);
    expect(solid.spells?.value).toEqual([4, 14]);
  });
});
