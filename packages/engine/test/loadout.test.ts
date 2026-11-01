import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChampionAttributes, ChampionBuild } from "@ldc/shared";
import { buildLoadout, chooseOption, parseEngineConfig, parseExplainConfig, rankItems, renderReason, type LoadoutInput } from "../src/index";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../config/${name}`, import.meta.url), "utf8"));
// Win added and lift alone (the popularity prior is tested separately).
// The win-added mechanics, at their former weight (shipped: 0, popularity first; tested below).
const shipped = parseEngineConfig(read("engine.v1.json")).loadout;
const cfg = { ...shipped, shareScale: 0, winAddedScale: 695 };
const explain = parseExplainConfig(read("explain.v1.json"));

const page = (keystone: number, games: number, wins: number) => ({ primaryStyle: 8000, subStyle: 8400, runes: [keystone, 2, 3, 4, 5, 6], statPerks: [5001, 5008, 5005], games, wins, n: games });

const build: ChampionBuild = {
  championId: 1,
  role: "top",
  n: 1000,
  timelineN: 800,
  games: 1000,
  wins: 500,
  pages: [page(8010, 600, 300), page(8005, 300, 165), page(8021, 20, 15)],
  spells: [{ spells: [4, 12], games: 900, wins: 450, n: 900 }],
  skills: [{ first: [1, 3, 2], order: [1, 3, 2], games: 700, wins: 350, n: 700 }],
  starting: [{ items: [1055, 2003], games: 600, wins: 300, n: 600 }],
  core: [{ items: [3071, 3053, 3065], games: 200, wins: 110, n: 200 }],
  items: [
    { itemId: 3071, slot: 1, n: 400, share: 0.5, winAdded: 0.01, minute: 12 },
    { itemId: 3078, slot: 1, n: 300, share: 0.38, winAdded: 0.02, minute: 13 },
    { itemId: 3999, slot: 1, n: 50, share: 0.06, winAdded: 0.09, minute: 14 },
    { itemId: 3998, slot: 1, n: 20, share: 0.02, winAdded: 0.2, minute: 14 }, // too rare to suggest
    { itemId: 3065, slot: 2, n: 200, share: 0.3, winAdded: 0.0, minute: 20 },
    { itemId: 3156, slot: 2, n: 150, share: 0.22, winAdded: 0.0, minute: 21 },
    { itemId: 3078, slot: 2, n: 100, share: 0.15, winAdded: 0.03, minute: 21 },
  ],
  lifts: [
    { kind: "item", id: 3156, trait: "magic", lift: 3, high: 0.3, low: 0.1, n: 500 },
    { kind: "rune", id: 8242, trait: "magic", lift: 2.2, high: 0.2, low: 0.09, n: 900 },
    { kind: "rune", id: 2, trait: "magic", lift: 1.5, high: 0.2, low: 0.1, n: 900 }, // already on the page
  ],
  matchupPages: [{ enemy: 99, ...page(8008, 40, 26) }],
};

const attr = (championId: number, magicShare: number): ChampionAttributes => ({
  championId, samples: 100, physicalShare: 1 - magicShare, magicShare, trueShare: 0, frontline: 0.5, engage: 0.5, roleShares: {}, roleSamples: 100,
});
const attributes = new Map([attr(11, 0.9), attr(12, 0.9), attr(13, 0.1), attr(99, 0.2)].map((a) => [a.championId, a]));
const cuts = { magic: 0.4, physical: 0.6, frontline: 0.5, engage: 0.5, heal: 0.5 };
const input = (over: Partial<LoadoutInput> = {}): LoadoutInput => ({ build, enemies: [13], laneOpponent: null, attributes, traitCuts: cuts, config: cfg, ...over });

describe("item minutes", () => {
  it("gives each slot its average minute over all purchases, and each item its own", () => {
    const [s1, s2] = rankItems(input());
    // Slot 1: (400×12 + 300×13 + 50×14 + 20×14) / 770.
    expect(s1!.minute).toBeCloseTo((400 * 12 + 300 * 13 + 50 * 14 + 20 * 14) / 770);
    expect(s1!.top.minute).toBe(s1!.top.itemId === 3071 ? 12 : s1!.top.itemId === 3078 ? 13 : 14);
    expect(s2!.minute).toBeCloseTo((200 * 20 + 150 * 21 + 100 * 21) / 450);
  });
});

describe("the second rune option", () => {
  const key = (l: { value: { runes: number[] } } | null) => l?.value.runes[0];

  it("is the next most taken page, and leaves the first page as it was", () => {
    const l = buildLoadout(input());
    expect(key(l.page)).toBe(8010);
    expect(chooseOption(build.pages, build, cfg)?.runes[0]).toBe(8010);
    expect(key(l.pageAlt)).toBe(8005);
    expect(l.pageAlt).toMatchObject({ kind: "second", share: 0.3, n: 300, winRate: 0.55, main: { kind: "popular", share: 0.6 } });
    expect(l.pageAlt!.reasons[0]).toMatchObject({ id: "loadout.page.second", slots: { count: 300, games: 1000 } });
  });

  it("keeps the literal order: a different keystone isn't required", () => {
    const sameKeystone = { ...page(8010, 300, 150), runes: [8010, 2, 3, 4, 5, 7] };
    const l = buildLoadout(input({ build: { ...build, pages: [page(8010, 600, 300), sameKeystone, page(8005, 90, 50)] } }));
    expect(l.pageAlt?.value.runes).toEqual(sameKeystone.runes);
  });

  it("hides a page below minGames or minShare", () => {
    const of = (pages: ChampionBuild["pages"]) => buildLoadout(input({ build: { ...build, pages } })).pageAlt;
    // 8021: 20 games of 1,000 is 2%, under minShare.
    expect(of([page(8010, 900, 450), page(8021, 20, 15)])).toBeNull();
    expect(cfg.minShare).toBe(0.08);
    // At exactly the share it shows; just under it doesn't.
    expect(key(of([page(8010, 900, 450), page(8021, 80, 40)]))).toBe(8021);
    expect(of([page(8010, 900, 450), page(8021, 79, 40)])).toBeNull();
    // Enough share but too few games: 4 of 20 games is 20%, under minGames (5).
    const small = { ...build, n: 20, games: 20, wins: 10 };
    expect(buildLoadout(input({ build: { ...small, pages: [page(8010, 16, 8), page(8021, cfg.minGames - 1, 2)] } })).pageAlt).toBeNull();
    expect(buildLoadout(input({ build: { ...small, pages: [page(8010, 15, 8), page(8021, cfg.minGames, 2)] } })).pageAlt?.share).toBe(cfg.minGames / 20);
  });

  it("is null with one page or none", () => {
    expect(buildLoadout(input({ build: { ...build, pages: [page(8010, 900, 450)] } })).pageAlt).toBeNull();
    expect(buildLoadout(input({ build: { ...build, pages: [] } })).pageAlt).toBeNull();
  });

  it("beside a matchup page, offers the usual page; the matchup's share stays unknown", () => {
    const l = buildLoadout(input({ laneOpponent: 99 }));
    expect(key(l.page)).toBe(8008);
    expect(key(l.pageAlt)).toBe(8010);
    expect(l.pageAlt).toMatchObject({ kind: "usual", share: 0.6, main: { kind: "matchup", share: null } });
    expect(l.pageAlt!.reasons[0]).toMatchObject({ id: "loadout.page.usual", slots: { count: 600, games: 1000 } });
  });

  it("beside a matchup page that is the usual page, offers the next one", () => {
    const l = buildLoadout(input({ laneOpponent: 99, build: { ...build, matchupPages: [{ enemy: 99, ...page(8010, 40, 26) }] } }));
    expect(key(l.page)).toBe(8010);
    expect(l.pageAlt).toMatchObject({ kind: "second", main: { kind: "matchup" } });
    expect(key(l.pageAlt)).toBe(8005);
  });

  it("when the page is the best by win rate, offers the most taken one", () => {
    const l = buildLoadout(input({ config: { ...cfg, pickBy: "winRate" } }));
    expect(key(l.page)).toBe(8005);
    expect(key(l.pageAlt)).toBe(8010);
    expect(l.pageAlt).toMatchObject({ kind: "popular", main: { kind: "best", share: 0.3 } });
  });

  it("gets swaps for its own page: a rune on it isn't suggested, one on the first page is", () => {
    const lifts: ChampionBuild["lifts"] = [
      { kind: "rune", id: 8005, trait: "magic", lift: 2.2, high: 0.2, low: 0.09, n: 900 },
      { kind: "rune", id: 8010, trait: "magic", lift: 2, high: 0.2, low: 0.1, n: 900 },
    ];
    const l = buildLoadout(input({ build: { ...build, lifts }, enemies: [11, 12], config: { ...cfg, runeMechanics: undefined } as typeof cfg }));
    expect(l.situationalRunes.map((r) => r.runeId)).toEqual([8005]);
    expect(l.pageAlt!.situationalRunes.map((r) => r.runeId)).toEqual([8010]);
  });
});

describe("buildLoadout", () => {
  it("by win rate: picks the most successful common rune page, smoothed, and spells, skills and starting items", () => {
    const l = buildLoadout(input({ config: { ...cfg, pickBy: "winRate" } }));
    // 8005 wins 55% in 300 games; 8021's 75% in 20 games is too rare (2%) to suggest.
    expect(l.page?.value.runes[0]).toBe(8005);
    expect(l.page?.reasons[0]?.id).toBe("loadout.page");
    expect(l.spells?.value).toEqual([4, 12]);
    expect(l.skills?.value).toEqual({ first: [1, 3, 2], order: [1, 3, 2] });
    expect(l.starting?.value).toEqual([1055, 2003]);
  });

  it("as shipped, picks the most taken page and spells, explained by how many players take them", () => {
    expect(shipped.pickBy).toBe("popular");
    const l = buildLoadout(input());
    expect(l.page?.value.runes[0]).toBe(8010);
    expect(l.page?.reasons[0]?.id).toBe("loadout.page.popular");
    expect(l.spells?.value).toEqual([4, 12]);
    expect(l.spells?.reasons[0]?.id).toBe("loadout.spells.popular");
  });

  it("switches to the page players use into the lane opponent when the matchup is common enough", () => {
    const into = buildLoadout(input({ laneOpponent: 99, config: { ...cfg, minMatchupGames: 30 } }));
    expect(into.page?.value.runes[0]).toBe(8008);
    expect(into.page?.reasons[0]?.id).toBe("loadout.page.matchup");
    expect(buildLoadout(input({ laneOpponent: 99, config: { ...cfg, minMatchupGames: 50 } })).page?.value.runes[0]).toBe(8010);
  });

  it("suggests situational runes against this enemy team only, never ones already on the page", () => {
    // The lift mechanics alone (no mechanic rules): the fixture's lift is on magic damage.
    const any = { ...cfg, runeMechanics: undefined };
    expect(buildLoadout(input({ enemies: [11, 12], config: any })).situationalRunes.map((r) => r.runeId)).toEqual([8242]);
    expect(buildLoadout(input({ enemies: [13], config: any })).situationalRunes).toEqual([]);
  });

  it("never suggests a rune for a trait no rune mechanic answers (magic or physical damage)", () => {
    expect(cfg.runeMechanics).toBeDefined();
    expect(buildLoadout(input({ enemies: [11, 12] })).situationalRunes).toEqual([]);
  });

  it("builds the core path from the ranked items, and falls back to the common path without them", () => {
    expect(buildLoadout(input()).core?.value).toEqual([3999, 3078]);
    const thin = buildLoadout(input({ build: { ...build, items: [] } }));
    expect(thin.core?.value).toEqual([3071, 3053, 3065]);
    expect(thin.core?.reasons[0]?.id).toBe("loadout.core.common");
  });

  it("explains every choice with configured wording", () => {
    const l = buildLoadout(input({ enemies: [11, 12], laneOpponent: 99, config: { ...cfg, minMatchupGames: 30 } }));
    const reasons = [l.page, l.spells, l.skills, l.starting].flatMap((c) => c!.reasons).concat(l.situationalRunes.flatMap((r) => r.reasons), l.items.flatMap((s) => [s.top, ...s.alternatives].flatMap((i) => i.reasons)));
    for (const r of reasons) expect(explain.templates[r.id], r.id).toBeDefined();
    expect(renderReason(l.items[1]!.top.reasons[0]!, explain.templates, String)).toBe("Bought 3.0× more vs magic-heavy teams; theirs deals 90% magic damage (500 games)");
  });
});

describe("rankItems", () => {
  it("ranks a slot by win added among items players commonly buy there", () => {
    const [slot1] = rankItems(input());
    expect(slot1!.top.itemId).toBe(3999);
    expect(slot1!.alternatives.map((i) => i.itemId)).toEqual([3078, 3071]);
    expect(slot1!.top.reasons[0]).toMatchObject({ id: "loadout.item.winAdded", slots: { slot: 1, delta: 0.09, games: 50 } });
  });

  it("with the shipped settings, ranks a slot by what players buy most, still lifted by the enemy team", () => {
    const [slot1] = rankItems(input({ config: shipped }));
    const shares = build.items.filter((i) => i.slot === 1).sort((a, b) => b.share - a.share);
    expect(shipped.winAddedScale).toBe(0);
    expect(slot1!.top.itemId).toBe(shares[0]!.itemId);
  });

  it("lifts the answer to the enemy team (magic resist vs a magic-heavy team) and leaves out the earlier slot's pick", () => {
    const even = rankItems(input())[1]!;
    const vsMagic = rankItems(input({ enemies: [11, 12] }))[1]!;
    expect(even.top.itemId).toBe(3078);
    expect(vsMagic.top.itemId).toBe(3156);
    expect(vsMagic.top.situational).toBeGreaterThan(0);
    expect(vsMagic.alternatives.map((i) => i.itemId)).not.toContain(3999);
  });

  it("never makes an item with clearly negative win added the top pick, however high its lift", () => {
    const b: ChampionBuild = {
      ...build,
      items: [
        { itemId: 1, slot: 1, n: 300, share: 0.5, winAdded: -0.05, minute: 12 },
        { itemId: 2, slot: 1, n: 300, share: 0.5, winAdded: 0, minute: 12 },
      ],
      lifts: [{ kind: "item", id: 1, trait: "magic", lift: 20, high: 0.9, low: 0.05, n: 600 }],
    };
    const [slot1] = rankItems(input({ build: b, enemies: [11, 12] }));
    expect(slot1!.top.itemId).toBe(2);
    expect(slot1!.alternatives[0]).toMatchObject({ itemId: 1, reasons: expect.arrayContaining([expect.objectContaining({ id: "loadout.item.winAdded.negative" })]) });
  });

  it("with the popularity prior, a rarely bought item needs much more win added to lead", () => {
    const [slot1] = rankItems(input({ config: { ...cfg, shareScale: 50 } }));
    expect(slot1!.top.itemId).toBe(3071);
  });

  it("skips items you already own", () => {
    expect(rankItems(input({ owned: [3999] }))[0]!.top.itemId).toBe(3078);
  });
});
