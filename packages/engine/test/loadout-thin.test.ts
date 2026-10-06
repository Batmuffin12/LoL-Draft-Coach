import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChampionBuild, ParticipantSummary, UserMatch } from "@ldc/shared";
import { buildLoadout, mergeBuilds, parseEngineConfig, parseExplainConfig, personalBuild, renderReason, type LoadoutInput } from "../src/index";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../config/${name}`, import.meta.url), "utf8"));
const cfg = parseEngineConfig(read("engine.v1.json")).loadout;
const explain = parseExplainConfig(read("explain.v1.json"));

const page = (keystone: number, n: number, wins: number) => ({ primaryStyle: 8100, subStyle: 8000, runes: [keystone, 2, 3, 4, 5, 6], statPerks: [5001, 5008, 5005], games: n, wins, n });
const empty = (role: string, n: number): ChampionBuild => ({
  championId: 950, role, n, timelineN: n, games: n, wins: n / 2, pages: [], spells: [], skills: [], starting: [], core: [], items: [], lifts: [], matchupPages: [],
});

// Naafiri: 5 mid games (Electrocute 3, another keystone 2 that won both: too few to trust win rates) and 8 jungle games.
const mid: ChampionBuild = {
  ...empty("middle", 5),
  pages: [page(8112, 3, 1), page(8128, 2, 2)],
  spells: [{ spells: [4, 14], games: 4, wins: 2, n: 4 }],
  items: [{ itemId: 6692, slot: 1, n: 2, share: 0.5, winAdded: 0.001, minute: 13 }],
};
const jungle: ChampionBuild = {
  ...empty("jungle", 8),
  pages: [page(8128, 6, 3)],
  spells: [{ spells: [4, 11], games: 8, wins: 4, n: 8 }],
  skills: [{ first: [1, 2, 3], order: [1, 3, 2], games: 7, wins: 3, n: 7 }],
  items: [{ itemId: 6692, slot: 1, n: 5, share: 0.7, winAdded: 0.002, minute: 12 }],
};
const input = (over: Partial<LoadoutInput> = {}): LoadoutInput => ({
  build: mid,
  pooled: mergeBuilds([mid, jungle]),
  enemies: [],
  laneOpponent: null,
  attributes: new Map(),
  traitCuts: { magic: 0.4, physical: 0.6, frontline: 0.5, engage: 0.5, heal: 0.5 },
  config: cfg,
  ...over,
});
const say = (r: { id: string; slots: Record<string, string | number> }) => renderReason(r, explain.templates, (id) => (id === 950 ? "Naafiri" : `#${id}`));

describe("loadouts from few games (partial pooling, your own games, no win rates)", () => {
  it("pools the champion's other roles, picks the most taken options and never quotes a win rate", () => {
    const l = buildLoadout(input());
    expect(l.source).toEqual({ games: 13, roleGames: 5, pooled: true, personalGames: 0, thin: true });
    // 8128 is taken in 8 of the 13 pooled games (and "won 2 of 2" in mid, which proves nothing).
    expect(l.page?.value.runes[0]).toBe(8128);
    expect(say(l.page!.reasons[0]!)).toBe("Most taken: 8 of 13 games");
    // Spells stay role-specific: no Smite for a mid laner.
    expect(l.spells?.value).toEqual([4, 14]);
    expect(say(l.spells!.reasons[0]!)).toBe("Most taken: 4 of 5 games");
    expect(l.skills?.value.order).toEqual([1, 3, 2]);
    // Items come from your lane only (never from the jungle games).
    expect(l.items[0]?.top.itemId).toBe(6692);
    expect(say(l.items[0]!.top.reasons[0]!)).toBe("Bought as item 1 in 50% of games (2 games)");
  });

  it("prefers your own page and spells on the champion when the band's data is thin", () => {
    const personal = { championId: 950, n: 25, pages: [page(8112, 18, 11)], spells: [{ spells: [4, 12], games: 20, wins: 11, n: 20 }], items: [{ itemId: 6692, n: 22 }] };
    const l = buildLoadout(input({ personal }));
    expect(l.page?.value.runes[0]).toBe(8112);
    expect(say(l.page!.reasons[0]!)).toBe("Your usual page: 18 of your 25 Naafiri games");
    expect(l.spells?.value).toEqual([4, 12]);
    expect(l.source.personalGames).toBe(25);
    // With plenty of band data, the band's page wins again.
    const solid = { ...mid, n: 500, games: 500, wins: 250, pages: [page(8128, 300, 160)], spells: [{ spells: [4, 14], games: 400, wins: 200, n: 400 }] };
    expect(buildLoadout(input({ build: solid, personal })).page?.value.runes[0]).toBe(8128);
  });

  it("falls back to the items you finish most when the band has no purchases at all", () => {
    const personal = { championId: 950, n: 25, pages: [], spells: [], items: [{ itemId: 6692, n: 22 }, { itemId: 3814, n: 15 }] };
    const l = buildLoadout(input({ build: empty("middle", 0), pooled: null, personal }));
    expect(l.core?.value).toEqual([6692, 3814]);
    expect(l.core?.reasons[0]?.id).toBe("loadout.core.personal");
  });
});

describe("items follow your lane and its matchup", () => {
  // 1101 is a jungle companion: bought in the jungle only (snapshot itemRoles, found from data).
  const itemRoles = { "1101": { jungle: 1 }, "1055": { middle: 0.6, top: 0.4 }, "6692": { middle: 0.5, jungle: 0.5 } };
  const midWithStarts: ChampionBuild = {
    ...mid,
    starting: [
      { items: [1101, 2003], games: 3, wins: 1, n: 3 }, // a mid game started with a jungle companion (someone's mistake)
      { items: [1055, 2003], games: 2, wins: 1, n: 2 },
    ],
    items: [
      { itemId: 1101, slot: 1, n: 3, share: 0.6, winAdded: 0, minute: 1 },
      { itemId: 6692, slot: 1, n: 2, share: 0.4, winAdded: 0, minute: 13 },
    ],
  };

  it("never suggests another role's role-locked items, and never pools starting items across roles", () => {
    const jungleStart = { ...jungle, starting: [{ items: [1101, 2031], games: 8, wins: 4, n: 8 }] };
    const l = buildLoadout(input({ build: midWithStarts, pooled: mergeBuilds([midWithStarts, jungleStart]), itemRoles }));
    expect(l.starting?.value).toEqual([1055, 2003]);
    expect(l.items[0]?.top.itemId).toBe(6692);
    expect(l.items.flatMap((s) => [s.top, ...s.alternatives]).some((i) => i.itemId === 1101)).toBe(false);
  });

  it("starts and builds into your lane opponent when that matchup is common enough", () => {
    const vsZed: ChampionBuild = {
      ...midWithStarts,
      n: 400,
      games: 400,
      wins: 200,
      items: [
        { itemId: 6692, slot: 1, n: 200, share: 0.6, winAdded: 0, minute: 13 },
        { itemId: 3814, slot: 1, n: 120, share: 0.36, winAdded: 0, minute: 14 },
      ],
      matchupItems: [{ enemy: 238, games: 40, starting: { items: [1036, 2003], n: 25 }, first: [{ itemId: 3814, n: 30 }, { itemId: 6692, n: 8 }] }],
    };
    const l = buildLoadout(input({ build: vsZed, laneOpponent: 238, enemies: [238], itemRoles }));
    expect(l.starting?.value).toEqual([1036, 2003]);
    expect(say(l.starting!.reasons[0]!)).toBe("Into #238: 25 of 40 players start with this");
    expect(l.items[0]?.top.itemId).toBe(3814);
    expect(say(l.items[0]!.top.reasons[0]!)).toMatch(/^Into #238: finished first 1\.\d× more often \(30 of 40 games\)$/);
    // Another lane opponent: the usual first item.
    expect(buildLoadout(input({ build: vsZed, laneOpponent: 99, enemies: [99], itemRoles })).items[0]?.top.itemId).toBe(6692);
  });

  it("counts your lane opponent more than the rest of the enemy team", () => {
    const attrs = new Map([
      [1, { championId: 1, samples: 50, physicalShare: 0.1, magicShare: 0.9, trueShare: 0, frontline: 0.5, engage: 0.5, roleShares: {}, roleSamples: 50 }],
      [2, { championId: 2, samples: 50, physicalShare: 0.9, magicShare: 0.1, trueShare: 0, frontline: 0.5, engage: 0.5, roleShares: {}, roleSamples: 50 }],
    ]);
    const b: ChampionBuild = {
      ...mid, n: 400, games: 400, wins: 200,
      items: [{ itemId: 3111, slot: 1, n: 100, share: 0.5, winAdded: 0, minute: 12 }, { itemId: 3047, slot: 1, n: 100, share: 0.5, winAdded: 0, minute: 12 }],
      lifts: [
        { kind: "item", id: 3111, trait: "magic", lift: 2, high: 0.4, low: 0.2, n: 400 },
        { kind: "item", id: 3047, trait: "physical", lift: 2, high: 0.4, low: 0.2, n: 400 },
      ],
    };
    // One magic and one physical enemy: the lane opponent decides.
    const cuts = { magic: 0.4, physical: 0.4, frontline: 0.5, engage: 0.5, heal: 0.5 };
    expect(buildLoadout(input({ build: b, enemies: [1, 2], laneOpponent: 1, attributes: attrs, traitCuts: cuts })).items[0]?.top.itemId).toBe(3111);
    expect(buildLoadout(input({ build: b, enemies: [1, 2], laneOpponent: 2, attributes: attrs, traitCuts: cuts })).items[0]?.top.itemId).toBe(3047);
  });
});

describe("personalBuild", () => {
  const me = (championId: number, position: string, win: boolean, runes: number[], items: number[]): ParticipantSummary => ({
    championId, teamId: 100, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0, physicalDamage: 0, magicDamage: 0, trueDamage: 0, damageTaken: 0,
    selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0, items, spells: [14, 4], perks: { primaryStyle: 8100, subStyle: 8000, runes, statPerks: [5001, 5008, 5005] }, challenges: {},
  });
  const m = (p: ParticipantSummary): UserMatch => ({ match: { matchId: "x", queueId: 420, gameVersion: "16.19", endedAt: 0, durationSec: 1800, participants: [p] }, me: 0 });

  it("counts your pages, spells and finished items on the champion, in your role when you play it there", () => {
    const matches = [m(me(950, "middle", true, [8112, 1], [6692, 1036])), m(me(950, "middle", false, [8112, 1], [6692])), m(me(950, "jungle", true, [8128, 1], [3814])), m(me(1, "middle", true, [9, 9], []))];
    const b = personalBuild(matches, 950, "middle", new Set([6692, 3814]))!;
    expect(b.n).toBe(2);
    expect(b.pages[0]).toMatchObject({ runes: [8112, 1], n: 2, wins: 1 });
    expect(b.spells[0]).toMatchObject({ spells: [4, 14], n: 2 });
    expect(b.items).toEqual([{ itemId: 6692, n: 2 }]);
    expect(personalBuild(matches, 950, "top", new Set())!.n).toBe(3); // no top games: all roles
    expect(personalBuild(matches, 777, null, new Set())).toBeNull();
  });
});
