import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChampionRoleStat, DraftState, MetaSnapshot, PairStat, Reason } from "@ldc/shared";
import {
  adviseLivePicks,
  assessPick,
  assignRoles,
  computeComfort,
  deltaWin,
  MetaIndex,
  parseEngineConfig,
  parseExplainConfig,
  rating,
  renderReason,
  smoothRate,
  suggestBans,
  suggestHoverBans,
  weightedQuantile,
  winOf,
  type LiveInput,
  type PlayerGame,
} from "../src/index";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "config");
const readJson = (f: string) => JSON.parse(readFileSync(join(CONFIG_DIR, f), "utf8"));
const config = parseEngineConfig(readJson("engine.v1.json"));
const explain = parseExplainConfig(readJson("explain.v1.json"));
const say = (r: Reason | null) => (r ? renderReason(r, explain.templates, (id) => `#${id}`) : "");
const text = (reasons: Reason[]) => reasons.map(say).join(" | ");

const DAY = 86_400_000;
const NOW = 1_000 * DAY;
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

/**
 * A band with 1,000 matches. Mid: 101 (the player's main), 102 (counters 201), 103 (strong,
 * never played), 201 (common enemy pick), 202 (beats 101 and 102). Other roles: one or two
 * champions each so enemy roles can be inferred.
 */
function snapshot(over: { gamesScale?: number } = {}): MetaSnapshot {
  const k = over.gamesScale ?? 1;
  const stat = (championId: number, role: string, games: number, wr: number): ChampionRoleStat => ({
    championId,
    role,
    games: games * k,
    wins: games * k * wr,
    n: Math.round(games * k),
  });
  const pair = (a: number, ra: string, b: number, rb: string, games: number, wrA: number): PairStat => [a, ra, b, rb, games * k, games * k * wrA, Math.round(games * k)];
  return {
    format: 1,
    band: 2,
    createdAt: NOW,
    patch: "16.19",
    matches: 1000 * k,
    newestMatchAt: NOW,
    halfLifeDays: 10,
    roleGames: Object.fromEntries(ROLES.map((r) => [r, 2000 * k])),
    champions: [
      stat(101, "middle", 500, 0.5),
      stat(102, "middle", 400, 0.5),
      stat(103, "middle", 400, 0.55),
      stat(201, "middle", 600, 0.5),
      stat(202, "middle", 400, 0.5),
      stat(301, "top", 900, 0.55),
      stat(302, "top", 900, 0.53),
      stat(302, "middle", 50, 0.5),
      stat(401, "jungle", 1000, 0.5),
      stat(501, "bottom", 1000, 0.5),
      stat(601, "utility", 1000, 0.5),
    ],
    matchups: [
      pair(101, "middle", 201, "middle", 300, 0.45),
      pair(102, "middle", 201, "middle", 300, 0.65),
      pair(101, "middle", 202, "middle", 200, 0.4),
      pair(102, "middle", 202, "middle", 200, 0.4),
    ],
    duos: [pair(103, "middle", 401, "jungle", 200, 0.6)],
    attributes: [],
    references: {},
  };
}

const index = (s = snapshot()) => new MetaIndex(s, config.rating);

function draft(theirChampions: number[] = [], allyHover = 0): DraftState {
  const slot = (cellId: number, championId = 0, position = "", local = false) => ({ cellId, championId, pickIntentId: 0, position, isLocalPlayer: local });
  return {
    timerPhase: "BAN_PICK",
    timeLeftMs: 30000,
    isCustomGame: false,
    localCellId: 2,
    myTeam: [
      { ...slot(0, 0, "top"), pickIntentId: allyHover },
      slot(1, 0, "jungle"),
      slot(2, 0, "middle", true),
      slot(3, 0, "bottom"),
      slot(4, 0, "utility"),
    ],
    theirTeam: [5, 6, 7, 8, 9].map((c, i) => slot(c, theirChampions[i] ?? 0)),
    myBans: [],
    theirBans: [],
    actions: [],
  };
}

const game = (championId: number, win: boolean, daysAgo = 1): PlayerGame => ({ championId, win, position: "middle", endedAt: NOW - daysAgo * DAY });
/** The player: a 101 main (40 games, 60% wins), a few games of 102. */
const games: PlayerGame[] = [...Array.from({ length: 40 }, (_, i) => game(101, i % 5 < 3, 1 + i)), ...Array.from({ length: 4 }, (_, i) => game(102, i < 2, 3 + i))];

function input(d: DraftState, over: Partial<LiveInput> = {}): LiveInput {
  const idx = over.index ?? index();
  return {
    draft: d,
    pickable: [101, 102, 103],
    unavailable: new Set(d.theirTeam.map((s) => s.championId).filter(Boolean)),
    comfort: computeComfort(games, [], NOW, config.comfort, "middle"),
    attributes: new Map(),
    intendedPositions: new Map(),
    role: "middle",
    weights: config.bands["2"]!,
    config,
    index: idx,
    band: 2,
    ...over,
  };
}

describe("rating maths", () => {
  it("maps win chances to additive rating points and back", () => {
    expect(rating(0.5)).toBeCloseTo(0);
    expect(winOf(rating(0.6))).toBeCloseTo(0.6);
    expect(rating(0.51)).toBeCloseTo(6.95, 1);
    expect(deltaWin(rating(0.53))).toBeCloseTo(0.03);
    expect(Number.isFinite(rating(1))).toBe(true);
  });

  it("smooths thin samples toward the expectation and weighs quantiles", () => {
    expect(smoothRate(0, 0, 0.55, 50)).toBe(0.55);
    expect(smoothRate(10, 10, 0.5, 10)).toBe(0.75);
    expect(weightedQuantile([{ value: -10, weight: 1 }, { value: 0, weight: 3 }, { value: 5, weight: 1 }], 0.2)).toBe(-10);
    expect(weightedQuantile([{ value: -10, weight: 1 }, { value: 0, weight: 3 }], 0.5)).toBe(0);
    expect(weightedQuantile([], 0.2)).toBe(0);
  });
});

describe("MetaIndex", () => {
  it("reads pairs from either side and pick rates per role", () => {
    const idx = index();
    expect(idx.matchup(101, "middle", 201, "middle").wins).toBeCloseTo(135);
    expect(idx.matchup(201, "middle", 101, "middle").wins).toBeCloseTo(165);
    expect(idx.duo(401, "jungle", 103, "middle").wins).toBeCloseTo(120);
    expect(idx.pickRate(201, "middle")).toBeCloseTo(0.6);
    expect(idx.mainRole(302)).toBe("top");
  });

  it("measures a matchup as a delta over what meta strength predicts, and is 0 without data", () => {
    const idx = index();
    expect(idx.matchupDelta(102, "middle", 201, "middle").delta).toBeGreaterThan(50);
    expect(idx.matchupDelta(101, "middle", 201, "middle").delta).toBeLessThan(-10);
    expect(idx.matchupDelta(103, "middle", 201, "middle")).toEqual({ delta: 0, n: 0 });
  });
});

describe("assignRoles", () => {
  it("places each enemy in its most likely role, jointly", () => {
    // 302 plays top mostly, but 301 only plays top: 302 is the one who goes elsewhere.
    const placed = assignRoles([{ championId: 301 }, { championId: 302 }, { championId: 201 }], index());
    const roleOf = (id: number) => placed.find((p) => p.championId === id)?.role;
    expect(roleOf(301)).toBe("top");
    expect(roleOf(201)).toBe("middle");
    expect(roleOf(302)).not.toBe("top");
  });

  it("keeps known positions and never gives away a reserved role", () => {
    const placed = assignRoles([{ championId: 201, role: "bottom" }, { championId: 202 }], index(), ["middle"]);
    expect(placed.find((p) => p.championId === 201)?.role).toBe("bottom");
    expect(placed.find((p) => p.championId === 202)?.role).not.toBe("middle");
  });
});

describe("adviseLivePicks", () => {
  it("gives a predicted win chance that is exactly the sum of its terms", () => {
    const advice = adviseLivePicks(input(draft()));
    expect(advice.picks.length).toBe(3);
    for (const p of advice.picks) {
      expect(p.terms?.map((t) => t.name)).toEqual(["meta", "lane", "counter", "synergy", "team", "personal"]);
      expect(winOf(p.terms!.reduce((s, t) => s + t.rating, 0))).toBeCloseTo(p.expectedWin!);
      expect(p.score).toBe(p.expectedWin);
    }
  });

  it("changes the ranking when the enemy laner is revealed, and explains it with real numbers", () => {
    const blind = adviseLivePicks(input(draft()));
    const into201 = adviseLivePicks(input(draft([201])));
    const rank = (a: typeof blind, id: number) => a.picks.findIndex((p) => p.championId === id);
    expect(rank(into201, 102)).toBe(0);
    expect(rank(into201, 102)).toBeLessThan(rank(blind, 102) === -1 ? 99 : rank(blind, 102) + 1);
    expect(text(into201.picks[0]!.reasons)).toMatch(/^\+\d+\.\d% into #201 \(300 games\)/);
    expect(say(into201.whyNot)).toMatch(/Picked over your #101: a better lane into #201 \(\+\d+\.\d%\)/);
    // The main's bad matchup shows as a caveat.
    const main = into201.picks.find((p) => p.championId === 101);
    if (main) expect(text(main.reasons)).toMatch(/But -\d+\.\d% into #201/);
  });

  it("rates blind picks by their likely opponents: risky with a common counter, safe without", () => {
    const advice = adviseLivePicks(input(draft()));
    const r101 = advice.picks.find((p) => p.championId === 101);
    const r102 = advice.picks.find((p) => p.championId === 102);
    expect(r101 && text(r101.reasons)).toMatch(/Risky blind pick: -\d+\.\d% into #(201|202)/);
    expect(r102 && text(r102.reasons)).toMatch(/Safe blind pick|Risky blind pick: -\d+\.\d% into #202/);
  });

  it("suggests a strong champion the player hasn't played, with the learning cost, only if pickable", () => {
    const advice = adviseLivePicks(input(draft()));
    const fresh = advice.picks.find((p) => p.championId === 103);
    expect(fresh).toBeDefined();
    expect(fresh!.terms!.find((t) => t.name === "personal")!.rating).toBeLessThan(0);
    expect(text(fresh!.reasons)).toMatch(/Strong in middle in your rank: 55\.0% win rate \(400 games\)/);
    expect(text(fresh!.reasons)).toMatch(/New to you/);
    const notOwned = adviseLivePicks(input(draft(), { pickable: [101, 102] }));
    expect(notOwned.picks.map((p) => p.championId)).not.toContain(103);
    const off = adviseLivePicks(input(draft(), { config: { ...config, rating: { ...config.rating, personal: { ...config.rating.personal, includeUnplayed: false } } } }));
    expect(off.picks.map((p) => p.championId)).not.toContain(103);
  });

  it("puts an off-meta habit behind the same pick in its usual role", () => {
    // The player's 101 games are in middle; in the band, 101 only plays middle. Ask for top.
    const top = adviseLivePicks(input(draft(), { role: "top", comfort: computeComfort(games.map((g) => ({ ...g, position: "top" })), [], NOW, config.comfort, "top") }));
    const p = top.picks.find((x) => x.championId === 101)!;
    expect(p.offMeta).toBe(true);
    expect(p.terms!.find((t) => t.name === "meta")!.rating).toBeCloseTo(-config.rating.offMetaPenalty);
    expect(text(p.reasons)).toMatch(/Off-meta in top/);
  });

  it("values comfort over meta: your main beats a stronger champion you've never played, but not a hard counter", () => {
    // No enemy laner yet: 101 (the player's main, 60% over 40 games) vs 103 (55% in the band, never played).
    const blind = adviseLivePicks(input(draft(), { pickable: [101, 103] })).picks.map((p) => p.championId);
    expect(blind.indexOf(101)).toBeLessThan(blind.indexOf(103));
    // Into 201, the 102 counter (+15% over 300 games) is still worth leaving the main for.
    expect(adviseLivePicks(input(draft([201]))).picks[0]!.championId).toBe(102);
  });

  it("doesn't force the single most comfortable champion: comfortable picks are equal, the draft decides", () => {
    // Both are comfortable (101 even more so); into 201 the draft favours 102.
    const base = computeComfort(games, [], NOW, config.comfort, "middle");
    const comfort = new Map([...base].map(([id, c]) => [id, { ...c, score: id === 101 ? 0.95 : 0.7 }]));
    const advice = adviseLivePicks(input(draft([201]), { comfort, pickable: [101, 102] }));
    const personal = (id: number) => advice.picks.find((p) => p.championId === id)!.terms!.find((t) => t.name === "personal")!.rating;
    expect(personal(101)).toBeCloseTo(personal(102));
    expect(advice.picks[0]!.championId).toBe(102);
  });

  it("says when a pick or a ban is trending in the band, without changing its score", () => {
    const trending = [
      { championId: 103, role: "middle", rising: "pick" as const, pickRate: { before: 0.04, recent: 0.09 }, winRate: { before: 0.5, recent: 0.51 }, games: { before: 40, recent: 45 } },
      { championId: 302, role: "top", rising: "both" as const, pickRate: { before: 0.3, recent: 0.5 }, winRate: { before: 0.5, recent: 0.56 }, games: { before: 300, recent: 200 } },
    ];
    const idx = index({ ...snapshot(), trending });
    const plain = adviseLivePicks(input(draft())).picks.find((p) => p.championId === 103)!;
    const withTrend = adviseLivePicks(input(draft(), { index: idx })).picks.find((p) => p.championId === 103)!;
    expect(text(withTrend.reasons)).toMatch(/Trending in middle: picked in 9% of games lately, up from 4%/);
    expect(withTrend.expectedWin).toBe(plain.expectedWin);
    const ban = suggestBans(input(draft([], 301), { index: idx })).find((b) => b.championId === 302)!;
    expect(text(ban.reasons)).toMatch(/Rising in top: picked in 50% of games \(was 30%\) and winning 56\.0% \(was 50\.0%\)/);
  });

  it("mentions a measured power curve only when it's clear and backed by enough games", () => {
    const attr = (championId: number, early: number, late: number, games = 100) => ({
      championId, samples: 400, physicalShare: 0.5, magicShare: 0.5, trueShare: 0, frontline: 0.5, engage: 0.5,
      roleShares: { middle: 1 }, roleSamples: 400,
      powerCurve: { early: { games, winRate: early }, late: { games, winRate: late } },
    });
    const idx = index({ ...snapshot(), attributes: [attr(103, 0.47, 0.55), attr(101, 0.5, 0.52), attr(102, 0.6, 0.4, 5)] });
    const reasons = (id: number) => text(adviseLivePicks(input(draft(), { index: idx })).picks.find((p) => p.championId === id)!.reasons);
    expect(reasons(103)).toMatch(/Scales: wins 55\.0% of long games vs 47\.0% of short ones/);
    expect(reasons(101)).not.toMatch(/Scales|Strong early/); // small gap
    expect(reasons(102)).not.toMatch(/Scales|Strong early/); // too few games
  });

  it("adds synergy with allies already picked", () => {
    const withJungle = draft();
    withJungle.myTeam[1]!.championId = 401;
    const p = adviseLivePicks(input(withJungle)).picks.find((x) => x.championId === 103)!;
    expect(p.terms!.find((t) => t.name === "synergy")!.rating).toBeGreaterThan(0);
    expect(text(p.reasons)).toMatch(/Works with your #401/);
  });

  it("says when the meta has too little data, and otherwise how clear the top pick is", () => {
    expect(adviseLivePicks(input(draft([201]), { index: index(snapshot({ gamesScale: 0.02 })) })).confidence).toBe("thin");
    expect(adviseLivePicks(input(draft([201]))).confidence).toMatch(/clear|close/);
  });
});

describe("assessPick", () => {
  it("scores the player's locked-in champion even though the draft counts it as taken", () => {
    const d = draft([201]);
    const p = assessPick(input(d, { unavailable: new Set([201, 102]) }), 102);
    expect(p.championId).toBe(102);
    expect(p.expectedWin).toBeGreaterThan(0.5);
    expect(text(p.reasons)).toMatch(/into #201 \(300 games\)/);
  });
});

describe("suggestBans", () => {
  it("bans what beats your best picks, never what you or your allies would play", () => {
    const bans = suggestBans(input(draft([], 301)));
    const ids = bans.map((b) => b.championId);
    expect(ids[0]).toBe(202);
    expect(text(bans[0]!.reasons)).toMatch(/Counters your #10[12]: -\d+\.\d% \(200 games\); picked in 40% of middle games/);
    expect(ids).not.toContain(301); // an ally is hovering it
    expect(ids).not.toContain(102);
    expect(bans.length).toBeLessThanOrEqual(config.rating.bans.topN);
    expect(ids).toContain(302); // strong top laner
    expect(bans.every((b) => b.reasons.length > 0)).toBe(true);
  });

  it("adds bans for a hovered champion: its own counters, no repeats, and just 1 when it's the top pick", () => {
    // 203 hard-counters 103 only (30% for 103 over 200 games); picked in 10% of mid games.
    const s = snapshot();
    const snap = {
      ...s,
      champions: [...s.champions, { championId: 203, role: "middle", games: 200, wins: 100, n: 200 }],
      matchups: [...s.matchups, [103, "middle", 203, "middle", 200, 60, 200] as [number, string, number, string, number, number, number]],
    };
    const inp = input(draft(), { index: index(snap) });
    const general = suggestBans(inp).map((b) => b.championId);
    const top = adviseLivePicks(inp).picks[0]!.championId;
    expect(top).not.toBe(103); // 103 is unplayed: not the top suggestion here
    const hover = suggestHoverBans(inp, 103, general);
    expect(hover.length).toBeGreaterThan(0);
    expect(hover.length).toBeLessThanOrEqual(config.rating.bans.hoverTopN);
    // Protecting only 103, its counter 203 must rank first among the hover bans.
    expect(suggestBans(inp, { protect: [103] })[0]!.championId).toBe(203);
    expect(hover.some((b) => general.includes(b.championId))).toBe(false);
    if (!general.includes(203)) {
      expect(hover[0]!.championId).toBe(203);
      expect(text(hover[0]!.reasons)).toMatch(/Counters your #103: -\d+\.\d% \(200 games\)/);
    }
    expect(suggestHoverBans(inp, top, general)).toHaveLength(config.rating.bans.hoverTopNWhenSuggested);
  });

  it("bans for your lane: a mid counter to your picks beats a hugely popular, strong bot laner", () => {
    // 701 = "Jinx": bottom only, in 60% of games, 54% win rate. 202 counters the mid picks we'd recommend.
    const s = snapshot();
    const withJinx = { ...s, champions: [...s.champions, { championId: 701, role: "bottom", games: 1200, wins: 648, n: 1200 }] };
    const bans = suggestBans(input(draft(), { index: index(withJinx) })).map((b) => b.championId);
    expect(bans[0]).toBe(202);
    expect(bans.indexOf(701) === -1 || bans.indexOf(701) > bans.indexOf(202)).toBe(true);
    // Without a known role (custom games), every champion is judged in its own main role, as before.
    const noRole = suggestBans(input(draft(), { index: index(withJinx), role: null })).map((b) => b.championId);
    expect(noRole).toContain(701);
  });

  it("says how often a suggested ban is banned in the band, once there is ban data", () => {
    const withBans = { ...snapshot(), banMatches: 800, bans: [{ championId: 302, bans: 240, n: 240 }] };
    const idx = index(withBans);
    expect(idx.banRate(302)).toEqual({ rate: 0.3, games: 800 });
    expect(idx.banRate(301)).toEqual({ rate: 0, games: 800 });
    expect(index().banRate(302)).toBeNull(); // older snapshot: no ban data
    const bans = suggestBans(input(draft([], 301), { index: idx }));
    expect(text(bans.find((b) => b.championId === 302)!.reasons)).toMatch(/Banned in 30% of games in your rank/);
  });

  it("still says why when the band has too few games for a win rate", () => {
    const bans = suggestBans(input(draft(), { index: index(snapshot({ gamesScale: 0.02 })) }));
    expect(bans.length).toBeGreaterThan(0);
    expect(text(bans[0]!.reasons)).toMatch(/Picked in \d+% of \w+ games in your rank \(not enough games yet/);
  });
});
