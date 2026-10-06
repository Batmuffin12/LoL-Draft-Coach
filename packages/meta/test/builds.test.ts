import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_BOUGHT, ITEM_DESTROYED, ITEM_SOLD, type ChampionAttributes, type MatchSummary, type MatchTimeline, type ParticipantSummary } from "@ldc/shared";
import { BuildAggregator, completedPurchases, maxOrder, parseMetaConfig, startingItems } from "../src/index";

const NOW = 1_800_000_000_000;
const config = parseMetaConfig(JSON.parse(readFileSync(new URL("../../../config/meta.v1.json", import.meta.url), "utf8")));
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];
// Completed items in these tests: 3001..3010 (as if derived from Data Dragon).
const COMPLETED = new Set([3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]);
const CUTS = { magic: 0.5, physical: 0.5, frontline: 0.5, engage: 0.5, heal: 0.5 };

const attr = (championId: number, magicShare: number): ChampionAttributes => ({
  championId,
  samples: 100,
  physicalShare: 1 - magicShare,
  magicShare,
  trueShare: 0,
  frontline: 0.5,
  engage: 0.5,
  roleShares: {},
  roleSamples: 100,
});

const PAGE = { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8138, 8135, 8226, 8210], statPerks: [5001, 5008, 5005] };
const MAGE_PAGE = { primaryStyle: 8400, subStyle: 8300, runes: [8437, 8446, 8429, 8451, 8304, 8347], statPerks: [5001, 5002, 5001] };

function participant(championId: number, position: string, teamId: number, win: boolean, extra: Partial<ParticipantSummary> = {}): ParticipantSummary {
  return {
    championId,
    teamId,
    position,
    win,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    gold: 0,
    visionScore: 0,
    physicalDamage: 0,
    magicDamage: 0,
    trueDamage: 0,
    damageTaken: 0,
    selfMitigated: 0,
    ccSeconds: 0,
    objectiveDamage: 0,
    items: [],
    spells: [4, 14],
    perks: PAGE,
    challenges: {},
    ...extra,
  };
}

/**
 * Champion 1 (top, blue) vs a red team of champions 11..15 (or 21..25: an all-magic team).
 * Champion 1 buys `items` as completed items at minutes 10, 20, 30. `blueGold` sets blue's gold lead.
 */
function game(id: string, opts: { win: boolean; items: number[]; magicEnemies?: boolean; blueGold?: number; timeline?: boolean; mageRune?: boolean }): MatchSummary {
  const red = opts.magicEnemies ? [21, 22, 23, 24, 25] : [11, 12, 13, 14, 15];
  const participants = [
    ...[1, 2, 3, 4, 5].map((c, i) => participant(c, ROLES[i]!, 100, opts.win, i === 0 && opts.mageRune ? { perks: MAGE_PAGE } : {})),
    ...red.map((c, i) => participant(c, ROLES[i]!, 200, !opts.win)),
  ];
  // The final inventory, for games without a timeline.
  participants[0]!.items = [...opts.items];
  const lead = opts.blueGold ?? 0;
  const gold = participants.map((p) => Array.from({ length: 31 }, (_, f) => f * 400 + (p.teamId === 100 ? lead / 5 : 0)));
  const timeline: MatchTimeline = {
    gold,
    items: [
      [0, 10, ITEM_BOUGHT, 1055],
      [0, 11, ITEM_BOUGHT, 2003],
      [0, 30, ITEM_SOLD, 2003],
      [0, 120, ITEM_BOUGHT, 1036],
      [0, 400, ITEM_DESTROYED, 1036],
      ...opts.items.map((it, k): [number, number, number, number] => [0, (k + 1) * 600, ITEM_BOUGHT, it]),
    ],
    skills: [[1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2], [], [], [], [], [], [], [], [], []],
  };
  return {
    matchId: id,
    queueId: 420,
    gameVersion: "16.19.1",
    endedAt: NOW - 3_600_000,
    durationSec: 1900,
    participants,
    ...(opts.timeline === false ? {} : { timeline }),
  };
}

const attributes = new Map<number, ChampionAttributes>([
  ...[11, 12, 13, 14, 15].map((c): [number, ChampionAttributes] => [c, attr(c, 0.1)]),
  ...[21, 22, 23, 24, 25].map((c): [number, ChampionAttributes] => [c, attr(c, 0.9)]),
]);
const cfg = { ...config.builds, minGames: 1, minOptionGames: 1, minItemGames: 1, winAddedPriorGames: 0, lift: { ...config.builds.lift, minGames: 3, priorGames: 2 } };
const make = (over: Partial<typeof cfg> = {}) =>
  new BuildAggregator({ now: NOW, halfLifeDays: 10, windowDays: 30, minDurationSec: 300, config: { ...cfg, ...over }, completed: COMPLETED, attributes, traitCuts: CUTS });
const champ1 = (agg: BuildAggregator) => agg.finish().find((b) => b.championId === 1)!;

describe("timeline helpers", () => {
  it("finds the max order: the skill that got all its points first, then by points", () => {
    expect(maxOrder([1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2])).toEqual([1, 3, 2]);
    expect(maxOrder([2, 1, 3, 2, 2, 4, 2, 1, 2])).toEqual([2, 1, 3]);
  });

  it("starting items drop what was sold in the first seconds; completed items keep purchase order", () => {
    const t = game("g", { win: true, items: [3002, 3001, 3002] }).timeline!;
    expect(startingItems(t, 0, 90)).toEqual([1055]);
    expect(completedPurchases(t, 0, COMPLETED)).toEqual([
      { itemId: 3002, sec: 600 },
      { itemId: 3001, sec: 1200 },
    ]);
  });
});

describe("BuildAggregator", () => {
  it("collects rune pages, spells, skill order, starting items and the core path", () => {
    const agg = make();
    for (let i = 0; i < 4; i++) agg.add(game(`a${i}`, { win: i < 3, items: [3001, 3002, 3003] }));
    agg.add(game("b", { win: false, items: [3004, 3002] }));
    const b = champ1(agg);
    expect(b).toMatchObject({ role: "top", n: 5, timelineN: 5 });
    expect(b.pages[0]).toMatchObject({ ...PAGE, n: 5 });
    expect(b.spells[0]).toMatchObject({ spells: [4, 14], n: 5 });
    expect(b.skills[0]).toMatchObject({ first: [1, 3, 2], order: [1, 3, 2], n: 5 });
    expect(b.starting[0]).toMatchObject({ items: [1055], n: 5 });
    expect(b.core[0]).toMatchObject({ items: [3001, 3002, 3003], n: 4 });
    expect(b.core.find((c) => c.items.join() === "3001,3002")?.n).toBe(4);
    expect(b.items.find((x) => x.itemId === 3001 && x.slot === 1)).toMatchObject({ n: 4, share: 0.8, minute: 10 });
  });

  it("win added subtracts the expected win of the state the item was bought in, unlike raw win rate", () => {
    const agg = make();
    // 3005 is bought by teams far ahead, who win 4 of 5 like everyone that far ahead: high raw
    // win rate, no win added. 3006 is bought when even and wins 4 of 5; 3007 when even and wins 1 of 5.
    for (let i = 0; i < 20; i++) agg.add(game(`ahead${i}`, { win: i % 5 !== 0, items: [3005], blueGold: 6000 }));
    for (let i = 0; i < 20; i++) agg.add(game(`even${i}`, { win: i % 5 !== 0, items: [3006] }));
    for (let i = 0; i < 20; i++) agg.add(game(`even-other${i}`, { win: i % 5 === 0, items: [3007] }));
    const b = champ1(agg);
    const wa = (id: number) => b.items.find((x) => x.itemId === id && x.slot === 1)!.winAdded;
    expect(Math.abs(wa(3005))).toBeLessThan(0.08);
    expect(wa(3006)).toBeGreaterThan(0.2);
    expect(wa(3007)).toBeLessThan(-0.2);
    const table = agg.expectedWinTable();
    expect(table.winRate).toHaveLength(config.builds.stateBins.minutes.length + 1);
    expect(table.n).toBeGreaterThan(0);
  });

  it("finds situational runes and items by lift against enemy traits", () => {
    const agg = make();
    for (let i = 0; i < 10; i++) agg.add(game(`p${i}`, { win: true, items: [3001, 3002] }));
    // Half of these have no timeline: their end-of-game items count instead.
    for (let i = 0; i < 10; i++) agg.add(game(`m${i}`, { win: true, items: [3001, 3008], magicEnemies: true, mageRune: i < 6, timeline: i % 2 === 0 }));
    const b = champ1(agg);
    expect(b.lifts.find((l) => l.kind === "item" && l.id === 3008 && l.trait === "magic")!.lift).toBeGreaterThan(5);
    expect(b.lifts.find((l) => l.kind === "rune" && l.id === 8437 && l.trait === "magic")).toBeDefined();
    // Bought against everyone: no lift.
    expect(b.lifts.some((l) => l.id === 3001)).toBe(false);
  });

  it("keeps a rune page into a lane opponent once the matchup is common enough", () => {
    const agg = make({ minMatchupGames: 3 });
    for (let i = 0; i < 3; i++) agg.add(game(`x${i}`, { win: true, items: [], magicEnemies: true, mageRune: true }));
    agg.add(game("y", { win: true, items: [] }));
    expect(champ1(agg).matchupPages).toEqual([expect.objectContaining({ enemy: 21, primaryStyle: 8400, n: 3 })]);
  });

  it("records which roles buy each item, and items into each lane opponent", () => {
    const agg = make({ minMatchupGames: 3, minItemRoleGames: 1 });
    for (let i = 0; i < 3; i++) agg.add(game(`z${i}`, { win: true, items: [3001, 3002] }));
    // Champion 1 is top: its items (held and bought) are top items.
    expect(agg.itemRoles()["3001"]).toEqual({ top: 1 });
    expect(agg.itemRoles()["1055"]).toEqual({ top: 1 });
    expect(champ1(agg).matchupItems).toEqual([{ enemy: 11, games: 3, starting: { items: [1055], n: 3 }, first: [{ itemId: 3001, n: 3 }] }]);
  });

  it("skips games outside the window, remakes and unpositioned games", () => {
    const agg = make();
    expect(agg.add({ ...game("old", { win: true, items: [] }), endedAt: NOW - 40 * 86_400_000 })).toBe(false);
    expect(agg.add({ ...game("remake", { win: true, items: [] }), durationSec: 200 })).toBe(false);
    expect(agg.finish()).toEqual([]);
  });
});
