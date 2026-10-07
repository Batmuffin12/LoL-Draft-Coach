import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChampionInfo, MetaSnapshot } from "@ldc/shared";
import { MetaIndex, parseEngineConfig, parseExplainConfig, recommendNewChampions, renderReason, type NewChampInput, type RolePool } from "../src/index";

const read = (n: string) => JSON.parse(readFileSync(new URL(`../../../config/${n}`, import.meta.url), "utf8"));
const config = parseEngineConfig(read("engine.v1.json"));
const explain = parseExplainConfig(read("explain.v1.json"));
const NAMES: Record<number, string> = { 1: "Mage", 2: "Assassin", 3: "Tank", 4: "Battlemage", 5: "Clone" };
const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, explain.templates, (id) => NAMES[id] ?? `#${id}`);

// Mid champions: 1 is your main (a mage). 4 is another mage, 5 a near-copy of 1, 2 an assassin, 3 a tank.
const info: Record<number, Pick<ChampionInfo, "info" | "tags">> = {
  1: { info: { attack: 2, defense: 3, magic: 9, difficulty: 5 }, tags: ["Mage"] },
  2: { info: { attack: 8, defense: 3, magic: 2, difficulty: 8 }, tags: ["Assassin"] },
  3: { info: { attack: 4, defense: 9, magic: 4, difficulty: 2 }, tags: ["Tank"] },
  4: { info: { attack: 3, defense: 4, magic: 8, difficulty: 3 }, tags: ["Mage", "Support"] },
  5: { info: { attack: 2, defense: 3, magic: 9, difficulty: 5 }, tags: ["Mage"] },
};
const stat = (championId: number, games: number, wr: number) => ({ championId, role: "middle", games, wins: games * wr, n: games });
const snapshot: MetaSnapshot = {
  format: 1, band: 2, createdAt: 0, patch: null, matches: 10_000, newestMatchAt: 0, halfLifeDays: 10,
  roleGames: { middle: 20_000 },
  champions: [stat(1, 2000, 0.5), stat(2, 2000, 0.5), stat(3, 800, 0.5), stat(4, 1500, 0.54), stat(5, 1500, 0.5), stat(6, 50, 0.6)],
  matchups: [], duos: [], attributes: [], references: {},
};
const pool = (over: Partial<RolePool> = {}): RolePool => ({ role: "middle", champions: [{ championId: 1, tier: "main", games: 40, winRate: 0.55, comfort: 0.8 }], holes: [], ...over });
const input = (over: Partial<NewChampInput> = {}): NewChampInput => ({
  role: "middle",
  pool: pool(),
  playedInRole: new Map([[1, 40]]),
  masteries: [],
  index: new MetaIndex(snapshot, config.rating),
  champions: (id) => info[id],
  attributes: new Map(),
  owned: new Set([1, 2, 3, 5]),
  config: config.newChamps,
  coverage: config.pool.coverage,
  ...over,
});

describe("recommendNewChampions", () => {
  it("suggests meta champions that play like your main, strong ones first, never a clone or your own pool", () => {
    const r = recommendNewChampions(input());
    const ids = r.picks.map((p) => p.championId);
    expect(ids[0]).toBe(4); // a mage like yours, strong in your rank, easy
    expect(ids).not.toContain(1); // already yours
    expect(ids).not.toContain(6); // too few games to be meta
    expect(r.picks.find((p) => p.championId === 5)?.parts.overlap ?? 1).toBeGreaterThan(0); // a clone is penalised
    const top = r.picks[0]!;
    expect(top).toMatchObject({ like: 1, ease: 1, owned: false });
    expect(top.reasons.map(say)).toEqual(["Plays like your Mage", "Strong in your rank: 53.6% win rate (1,500 games)", "Easy to pick up", "You don't own it yet"]);
  });

  it("adds champions that fill a pool gap", () => {
    const attributes = new Map([[3, { championId: 3, samples: 100, physicalShare: 0.5, magicShare: 0.5, trueShare: 0, frontline: 0.9, engage: 0.9, roleShares: {}, roleSamples: 100 }]]);
    const r = recommendNewChampions(input({ attributes, pool: pool({ holes: [{ need: "frontline", coveredBy: [], lossesLacking: 4, losses: 9 }] }) }));
    const tank = r.picks.find((p) => p.championId === 3)!;
    expect(tank.covers).toEqual(["frontline"]);
    expect(tank.reasons.map(say)).toContain("Adds the frontline your mid pool lacks");
  });

  it("waits while you're learning a champion in the role", () => {
    const r = recommendNewChampions(input({ pool: pool({ champions: [...pool().champions, { championId: 2, tier: "learning", games: 2, winRate: null, comfort: 0.2 }] }) }));
    expect(r).toEqual({ role: "middle", picks: [], learning: 2 });
  });
});
