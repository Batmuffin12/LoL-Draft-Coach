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
    const personal = { championId: 950, n: 25, pages: [page(8112, 18, 11)], spells: [{ spells: [4, 12], games: 20, wins: 11, n: 20 }], items: [{ itemId: 6692, n: 22 }, { itemId: 3814, n: 15 }] };
    const l = buildLoadout(input({ personal }));
    expect(l.page?.value.runes[0]).toBe(8112);
    expect(say(l.page!.reasons[0]!)).toBe("Your usual page: 18 of your 25 Naafiri games");
    expect(l.spells?.value).toEqual([4, 12]);
    expect(l.source.personalGames).toBe(25);
    // 25 of your own games beat 5 band games for the build too.
    expect(l.core?.value).toEqual([6692, 3814]);
    expect(l.items).toEqual([]);
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

describe("boots on their own row", () => {
  // 3020 Sorcerer's Shoes, 3047 Plated Steelcaps (boots per Data Dragon's tag); 6692 a legendary.
  const boots = new Set([3020, 3047]);
  const b: ChampionBuild = {
    ...mid,
    n: 400,
    games: 400,
    wins: 200,
    items: [
      { itemId: 3020, slot: 1, n: 150, share: 0.4, winAdded: 0, minute: 10 },
      { itemId: 6692, slot: 1, n: 200, share: 0.5, winAdded: 0, minute: 12 },
      { itemId: 3020, slot: 2, n: 100, share: 0.3, winAdded: 0, minute: 16 },
      { itemId: 3047, slot: 2, n: 60, share: 0.2, winAdded: 0, minute: 16 },
      { itemId: 3814, slot: 2, n: 150, share: 0.45, winAdded: 0, minute: 18 },
    ],
    lifts: [{ kind: "item", id: 3047, trait: "physical", lift: 5, high: 0.5, low: 0.1, n: 400 }],
  };

  it("picks boots from every build slot and keeps them out of the item slots", () => {
    const l = buildLoadout(input({ build: b, boots }));
    expect(l.boots?.top.itemId).toBe(3020);
    expect(l.boots?.alternatives.map((x) => x.itemId)).toEqual([3047]);
    expect(say(l.boots!.top.reasons[0]!)).toBe("0.0% win added; 81% of boots bought (250 games)");
    expect(l.items.map((s) => s.top.itemId)).toEqual([6692, 3814]);
  });

  it("switches to armor boots against a physical lane opponent", () => {
    const attrs = new Map([[238, { championId: 238, samples: 50, physicalShare: 0.95, magicShare: 0.05, trueShare: 0, frontline: 0.5, engage: 0.5, roleShares: {}, roleSamples: 50 }]]);
    const l = buildLoadout(input({ build: b, boots, enemies: [238], laneOpponent: 238, attributes: attrs, traitCuts: { magic: 0.4, physical: 0.5, frontline: 0.5, engage: 0.5, heal: 0.5 } }));
    expect(l.boots?.top.itemId).toBe(3047);
  });

  it("says what your role quest turns the boots into, linked by Data Dragon's build path", () => {
    // 3175 is held by 53% of mid games but never bought; it builds from 3020.
    const from = (id: number) => (id === 3175 ? [3020] : id === 3020 ? [1001] : []);
    const l = buildLoadout(input({ build: b, boots, buildsFrom: from, roleRewards: [{ itemId: 3175, share: 0.53 }, { itemId: 3172, share: 0.1 }] }));
    expect(l.quest.map((q) => [q.itemId, q.from])).toEqual([[3175, 3020]]);
    expect(say(l.quest[0]!.reasons[0]!)).toBe("Your middle quest turns #3020 into #3175 (53% of middle games end with it)");
    // A quest reward is never suggested as a purchase, even from your own games.
    const personal = { championId: 950, n: 25, pages: [], spells: [], items: [{ itemId: 3175, n: 20 }, { itemId: 6692, n: 22 }, { itemId: 3814, n: 15 }] };
    const own = buildLoadout(input({ boots: new Set([3020, 3175]), personal, roleRewards: [{ itemId: 3175, share: 0.53 }] }));
    expect(own.core?.value).toEqual([6692, 3814]);
    // …but your quest-upgraded boots count as the boots they came from.
    expect(buildLoadout(input({ boots: new Set([3020]), personal, roleRewards: [{ itemId: 3175, share: 0.53 }], buildsFrom: from })).boots?.top.itemId).toBe(3020);
    // Upgraded boots aren't "completed" items, so they come from everything you held.
    const heldOnly = { ...personal, items: [{ itemId: 6692, n: 22 }], held: [{ itemId: 3175, n: 20 }, { itemId: 6692, n: 22 }] };
    expect(buildLoadout(input({ boots: new Set([3020]), personal: heldOnly, roleRewards: [{ itemId: 3175, share: 0.53 }], buildsFrom: from })).boots?.top.itemId).toBe(3020);
    expect(own.boots).toBeNull(); // without build paths it can't tell
    // No quest reward linked to your items: nothing shown.
    expect(buildLoadout(input({ build: b, boots, buildsFrom: from, roleRewards: [{ itemId: 3172, share: 0.1 }] })).quest).toEqual([]);
  });

  it("uses your usual boots when the band has too few games", () => {
    const personal = { championId: 950, n: 25, pages: [], spells: [], items: [{ itemId: 6692, n: 22 }, { itemId: 3020, n: 20 }, { itemId: 3814, n: 15 }] };
    const l = buildLoadout(input({ boots, personal }));
    expect(l.boots?.top.itemId).toBe(3020);
    expect(say(l.boots!.top.reasons[0]!)).toBe("Your usual boots: 20 of your 25 Naafiri games");
    expect(l.core?.value).toEqual([6692, 3814]);
  });
});

describe("full build and situational items", () => {
  it("builds five items from your own games when the band has too few", () => {
    const personal = { championId: 950, n: 25, pages: [], spells: [], items: [1, 2, 3, 4, 5, 6].map((id, i) => ({ itemId: 6690 + id, n: 25 - i })) };
    expect(buildLoadout(input({ personal })).core?.value).toEqual([6691, 6692, 6693, 6694, 6695]);
  });

  it("suggests items that answer this enemy team, strongest need first, never boots or items on the path", () => {
    const attrs = new Map([[1, { championId: 1, samples: 50, physicalShare: 0.1, magicShare: 0.9, trueShare: 0, frontline: 0.5, engage: 0.5, heal: 0.95, roleShares: {}, roleSamples: 50 }]]);
    const b: ChampionBuild = {
      ...mid, n: 400, games: 400, wins: 200,
      items: [{ itemId: 6692, slot: 1, n: 200, share: 0.6, winAdded: 0, minute: 12 }],
      lifts: [
        { kind: "item", id: 3156, trait: "magic", lift: 3, high: 0.3, low: 0.1, n: 400 },
        { kind: "item", id: 3033, trait: "heal", lift: 4, high: 0.4, low: 0.1, n: 400 },
        { kind: "item", id: 3047, trait: "physical", lift: 3, high: 0.3, low: 0.1, n: 400 }, // this team isn't physical
        { kind: "item", id: 6692, trait: "magic", lift: 1.5, high: 0.6, low: 0.4, n: 400 }, // already on the path
        { kind: "item", id: 3111, trait: "magic", lift: 2, high: 0.2, low: 0.1, n: 400 }, // boots
      ],
    };
    const l = buildLoadout(input({ build: b, enemies: [1], laneOpponent: 1, attributes: attrs, boots: new Set([3111]), traitCuts: { magic: 0.4, physical: 0.4, frontline: 0.5, engage: 0.5, heal: 0.5 } }));
    expect(l.situational.map((s) => [s.itemId, s.trait])).toEqual([[3033, "heal"], [3156, "magic"]]);
    expect(say(l.situational[0]!.reasons[0]!)).toBe("Bought 4.0× more vs teams that heal a lot, like this one (400 games)");
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
