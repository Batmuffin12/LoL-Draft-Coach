import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DraftState, Reason } from "@ldc/shared";
import {
  advisePicks,
  confidenceOf,
  usualPick,
  parseExplainConfig,
  renderReason,
  allyChampions,
  bandForTier,
  bandFromRankedEntries,
  combineFactors,
  computeComfort,
  ConfigError,
  deriveChampionAttributes,
  draftRole,
  mainRole,
  parseEngineConfig,
  parseRankBandConfig,
  percentile,
  recommendPicks,
  roleFit,
  adviseRoles,
  gradeScore,
  scoreTeamNeeds,
  teamProfile,
  weightsForBand,
  type AttributeSample,
  type PlayerGame,
} from "../src/index";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "config");
const readJson = (f: string) => JSON.parse(readFileSync(join(CONFIG_DIR, f), "utf8"));
const engineCfg = parseEngineConfig(readJson("engine.v1.json"));
const explainCfg = parseExplainConfig(readJson("explain.v1.json"));
/** Reasons as the player reads them (champion names shown as #id). */
const text = (reasons: Reason[]) => reasons.map((r) => renderReason(r, explainCfg.templates, (id) => `#${id}`)).join(" ");
const bandCfg = parseRankBandConfig(readJson("rank-bands.v1.json"));

const DAY = 86_400_000;
const NOW = 1_000 * DAY;
const game = (championId: number, win: boolean, daysAgo = 1, position = "middle"): PlayerGame => ({
  championId,
  win,
  position,
  endedAt: NOW - daysAgo * DAY,
});

describe("config", () => {
  it("parses the committed config files", () => {
    expect(engineCfg.version).toBe(1);
    for (const b of bandCfg.bands) expect(() => weightsForBand(b.id, engineCfg)).not.toThrow();
  });

  it("rejects invalid config with a clear error", () => {
    expect(() => parseEngineConfig({ ...readJson("engine.v1.json"), topN: 0 })).toThrow(ConfigError);
    expect(() => parseRankBandConfig({ ...readJson("rank-bands.v1.json"), defaultBand: 99 })).toThrow(/defaultBand/);
  });

  it("maps tiers to bands from config, case-insensitively", () => {
    expect(bandForTier("PLATINUM", bandCfg)).toBe(2);
    expect(bandForTier("emerald", bandCfg)).toBe(3);
    expect(bandForTier("SOME_FUTURE_TIER", bandCfg)).toBeNull();
    expect(bandForTier("", bandCfg)).toBeNull();
  });

  it("picks the band from ranked entries in configured queue order, else the default", () => {
    expect(
      bandFromRankedEntries(
        [
          { queueType: "RANKED_FLEX_SR", tier: "SILVER" },
          { queueType: "RANKED_SOLO_5x5", tier: "PLATINUM" },
        ],
        bandCfg,
      ),
    ).toBe(2);
    expect(bandFromRankedEntries([{ queueType: "RANKED_FLEX_SR", tier: "DIAMOND" }, { queueType: "RANKED_SOLO_5x5", tier: "" }], bandCfg)).toBe(3);
    expect(bandFromRankedEntries([], bandCfg)).toBe(bandCfg.defaultBand);
  });
});

describe("percentile", () => {
  it("ranks values with ties at the mid-rank", () => {
    expect(percentile(1, [1, 2, 3])).toBe(0);
    expect(percentile(3, [1, 2, 3])).toBe(1);
    expect(percentile(2, [1, 2, 3])).toBe(0.5);
    expect(percentile(5, [5])).toBe(0.5);
  });
});

describe("computeComfort", () => {
  const cfg = engineCfg.comfort;

  it("rates a champion played often and won often above a rarely played one", () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => game(1, i < 7)),
      game(2, true),
      ...Array.from({ length: 6 }, (_, i) => game(3, i < 2)),
    ];
    const c = computeComfort(games, [], NOW, cfg);
    expect(c.get(1)!.score).toBeGreaterThan(c.get(2)!.score);
    expect(c.get(1)!.score).toBeGreaterThan(c.get(3)!.score);
    expect(c.get(1)!.games).toBe(10);
    expect(c.get(1)!.winRate).toBeCloseTo(0.7);
  });

  it("smooths small samples toward the player's own average", () => {
    const games = [game(1, true), ...Array.from({ length: 20 }, (_, i) => game(2, i % 2 === 0))];
    const one = computeComfort(games, [], NOW, cfg).get(1)!;
    expect(one.winRate).toBe(1);
    expect(one.smoothedWinRate).toBeLessThan(0.7); // one win doesn't mean 100%
  });

  it("weights recent games more than old ones", () => {
    const recentWins = [...Array.from({ length: 5 }, () => game(1, true, 1)), ...Array.from({ length: 5 }, () => game(1, false, 200))];
    const oldWins = [...Array.from({ length: 5 }, () => game(1, true, 200)), ...Array.from({ length: 5 }, () => game(1, false, 1))];
    const filler = Array.from({ length: 10 }, (_, i) => game(9, i % 2 === 0, 1));
    const a = computeComfort([...recentWins, ...filler], [], NOW, cfg).get(1)!;
    const b = computeComfort([...oldWins, ...filler], [], NOW, cfg).get(1)!;
    expect(a.smoothedWinRate).toBeGreaterThan(b.smoothedWinRate);
  });

  it("includes champions known only from mastery", () => {
    const c = computeComfort([game(1, true)], [{ championId: 7, level: 7, points: 300_000 }, { championId: 1, level: 2, points: 5_000 }], NOW, cfg);
    expect(c.get(7)!.games).toBe(0);
    expect(c.get(7)!.masteryLevel).toBe(7);
    expect(c.get(7)!.score).toBeGreaterThan(0);
  });

  it("tracks games per position", () => {
    const c = computeComfort([game(1, true, 1, "top"), game(1, false, 1, "top"), game(1, true, 1, "jungle")], [], NOW, cfg);
    expect(c.get(1)!.gamesByPosition).toEqual({ top: 2, jungle: 1 });
  });
});

const sample = (championId: number, o: Partial<AttributeSample> = {}): AttributeSample => ({
  championId,
  position: "top",
  physicalDamage: 10_000,
  magicDamage: 1_000,
  trueDamage: 0,
  damageTaken: 20_000,
  selfMitigated: 10_000,
  ccSeconds: 10,
  durationSec: 1800,
  ...o,
});

// A small measured "meta": 1 = AD bruiser, 2 = AP mage, 3 = AD tank with lots of CC, 4 = AD carry.
const attrSamples: AttributeSample[] = [
  ...Array.from({ length: 4 }, () => sample(1, { position: "top" })),
  ...Array.from({ length: 4 }, () => sample(2, { position: "middle", physicalDamage: 1_000, magicDamage: 20_000, damageTaken: 12_000, selfMitigated: 2_000, ccSeconds: 15 })),
  ...Array.from({ length: 4 }, () => sample(3, { position: "utility", damageTaken: 40_000, selfMitigated: 40_000, ccSeconds: 60 })),
  ...Array.from({ length: 4 }, () => sample(4, { position: "bottom", physicalDamage: 25_000, damageTaken: 10_000, selfMitigated: 1_000, ccSeconds: 2 })),
  sample(5), // too few samples
];
const attrs = deriveChampionAttributes(attrSamples, engineCfg.teamNeeds.minAttributeSamples);

describe("deriveChampionAttributes", () => {
  it("measures damage type, frontline, CC and roles from match stats", () => {
    expect(attrs.get(2)!.magicShare).toBeGreaterThan(0.9);
    expect(attrs.get(1)!.physicalShare).toBeGreaterThan(0.9);
    expect(attrs.get(3)!.frontline).toBe(1);
    expect(attrs.get(3)!.engage).toBe(1);
    expect(attrs.get(4)!.frontline).toBe(0);
    expect(attrs.get(2)!.roleShares).toEqual({ middle: 1 });
  });

  it("leaves out champions without enough samples", () => {
    expect(attrs.has(5)).toBe(false);
  });
});

describe("team needs", () => {
  const cfg = engineCfg.teamNeeds;

  it("has no opinion before any ally is known", () => {
    expect(scoreTeamNeeds(attrs.get(2), teamProfile([], attrs), cfg).score).toBeNull();
  });

  it("prefers magic damage for an all-physical team", () => {
    const profile = teamProfile([1, 4], attrs); // bruiser + ADC
    const mage = scoreTeamNeeds(attrs.get(2), profile, cfg);
    const adc = scoreTeamNeeds(attrs.get(4), profile, cfg);
    expect(mage.score!).toBeGreaterThan(adc.score!);
    expect(text(mage.reasons)).toMatch(/magic damage/);
  });

  it("prefers a tank when the team has no frontline", () => {
    const profile = teamProfile([2, 4], attrs); // mage + ADC, both squishy
    const tank = scoreTeamNeeds(attrs.get(3), profile, cfg);
    const adc = scoreTeamNeeds(attrs.get(4), profile, cfg);
    expect(tank.score!).toBeGreaterThan(adc.score!);
    expect(text(tank.reasons)).toMatch(/frontline/);
  });

  it("does not ask for frontline when a measured bruiser is already there", () => {
    const tank = scoreTeamNeeds(attrs.get(3), teamProfile([1, 4], attrs), cfg);
    expect(text(tank.reasons)).not.toMatch(/frontline/);
  });

  it("is neutral for an unmeasured candidate", () => {
    expect(scoreTeamNeeds(undefined, teamProfile([1], attrs), cfg).score).toBe(0.5);
  });
});

function draft(overrides: Partial<DraftState> = {}): DraftState {
  const slot = (cellId: number, championId = 0, position = "") => ({
    cellId,
    championId,
    pickIntentId: 0,
    position,
    isLocalPlayer: cellId === 2,
  });
  return {
    timerPhase: "BAN_PICK",
    timeLeftMs: 30000,
    isCustomGame: false,
    localCellId: 2,
    myTeam: [slot(0, 1, "top"), slot(1, 4, "jungle"), slot(2, 0, "middle"), slot(3), slot(4)],
    theirTeam: [5, 6, 7, 8, 9].map((c) => slot(c)),
    myBans: [],
    theirBans: [],
    actions: [],
    ...overrides,
  };
}

describe("role helpers", () => {
  it("finds the main role and the draft role", () => {
    const games = [game(1, true, 1, "top"), game(1, true, 1, "middle"), game(1, true, 1, "middle"), game(1, true, 1, "")];
    expect(mainRole(games)).toBe("middle");
    expect(mainRole([])).toBeNull();
    expect(draftRole(draft(), games)).toBe("middle");
    const custom = draft({ myTeam: draft().myTeam.map((s) => ({ ...s, position: "" })) });
    expect(draftRole(custom, [game(1, true, 1, "top")])).toBe("top");
  });

  it("lists ally champions from locks and hovers, excluding the local player", () => {
    const d = draft();
    d.myTeam[3]!.pickIntentId = 3;
    d.myTeam[2]!.pickIntentId = 2;
    expect(allyChampions(d)).toEqual([1, 4, 3]);
  });
});

describe("combineFactors", () => {
  it("skips factors without data and renormalises", () => {
    const w = { comfort: 0.4, teamNeeds: 0.2, laneMatchup: 0.2, counterValue: 0.1, metaStrength: 0.1 };
    expect(combineFactors({ comfort: 1, teamNeeds: null, laneMatchup: null, counterValue: null, metaStrength: null }, w)).toBe(1);
    expect(combineFactors({ comfort: 1, teamNeeds: 0, laneMatchup: null, counterValue: null, metaStrength: null }, w)).toBeCloseTo(2 / 3);
  });
});

describe("recommendPicks", () => {
  const games = [
    ...Array.from({ length: 8 }, (_, i) => game(2, i < 5, 2, "middle")), // mage, mid
    ...Array.from({ length: 8 }, (_, i) => game(10, i < 6, 2, "middle")), // unmeasured mid champ, good WR
    ...Array.from({ length: 8 }, (_, i) => game(4, i < 6, 2, "bottom")), // adc, not mid
    ...Array.from({ length: 3 }, (_, i) => game(11, i < 2, 2, "middle")),
    ...Array.from({ length: 3 }, (_, i) => game(12, i < 1, 2, "middle")),
  ];
  const comfort = computeComfort(games, [], NOW, engineCfg.comfort, "middle");
  const base = {
    intendedPositions: new Map<number, string[]>([[2, ["middle"]], [11, ["middle"]], [12, ["middle"]], [4, ["bottom"]]]),
    draft: draft(),
    pickable: [] as number[],
    unavailable: new Set<number>(),
    comfort,
    attributes: attrs,
    role: "middle" as string | null,
    weights: weightsForBand(2, engineCfg),
    config: engineCfg,
  };

  it("returns the configured number of picks, best first, with a factor breakdown", () => {
    const picks = recommendPicks(base);
    expect(picks).toHaveLength(engineCfg.topN);
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1]!.score).toBeGreaterThanOrEqual(picks[i]!.score);
    expect(picks[0]!.factors.comfort).not.toBeNull();
    expect(picks[0]!.factors.laneMatchup).toBeNull();
    expect(text(picks[0]!.reasons.slice(0, 1))).toMatch(/recent middle games, \d+% win rate/);
  });

  it("only suggests champions from the player's pool that fit the role", () => {
    const ids = recommendPicks({ ...base, config: { ...engineCfg, topN: 10 } }).map((p) => p.championId);
    expect(ids).not.toContain(4); // played only bottom
    expect(ids).toContain(2);
    expect(ids).not.toContain(3); // never played
  });

  it("team needs lift the mage when allies are all physical", () => {
    const withAllies = recommendPicks({ ...base, config: { ...engineCfg, topN: 10 } });
    const alone = recommendPicks({ ...base, draft: draft({ myTeam: draft().myTeam.map((s) => ({ ...s, championId: 0 })) }), config: { ...engineCfg, topN: 10 } });
    const rank = (list: typeof alone) => list.findIndex((p) => p.championId === 2);
    expect(rank(withAllies)).toBeLessThanOrEqual(rank(alone));
    expect(withAllies.find((p) => p.championId === 2)!.factors.teamNeeds).not.toBeNull();
    expect(alone.find((p) => p.championId === 2)!.factors.teamNeeds).toBeNull();
  });

  it("never suggests banned, taken or unpickable champions", () => {
    const ids = recommendPicks({ ...base, unavailable: new Set([2]), pickable: [2, 10, 11], config: { ...engineCfg, topN: 10 } }).map((p) => p.championId);
    expect(ids).toEqual(expect.arrayContaining([10, 11]));
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(12);
  });

  it("is deterministic", () => {
    expect(recommendPicks(base)).toEqual(recommendPicks(base));
  });

  it("explains why #1 beats the usual pick: off-meta, team needs, or unavailable", () => {
    expect(usualPick(base)?.championId).toBe(10);
    const offMeta = advisePicks(base, explainCfg.settings);
    expect(offMeta.picks[0]?.championId).toBe(2);
    expect(offMeta.whyNot).toEqual({ id: "whyNot.offMeta", slots: { champion: 10, role: "middle" } });

    // 10 listed for middle, and measured as a pure physical damage dealer: an all-physical team wants the mage.
    const physical10 = { championId: 10, samples: 20, physicalShare: 0.95, magicShare: 0.03, trueShare: 0.02, frontline: 0.2, engage: 0.2, roleShares: {}, roleSamples: 0 };
    const listed = {
      ...base,
      intendedPositions: new Map([...base.intendedPositions, [10, ["middle"]]]),
      attributes: new Map([...base.attributes, [10, physical10]]),
    };
    const team = advisePicks(listed, explainCfg.settings);
    expect(team.picks[0]?.championId).toBe(2);
    expect(text(team.whyNot ? [team.whyNot] : [])).toBe("Picked over your #10: your team needs magic damage");

    const banned = advisePicks({ ...listed, unavailable: new Set([10]) }, explainCfg.settings);
    expect(text(banned.whyNot ? [banned.whyNot] : [])).toBe("Your #10 is banned or taken");
  });

  it("has no why-not line when #1 is the usual pick", () => {
    const alone = { ...base, draft: draft({ myTeam: draft().myTeam.map((s) => ({ ...s, championId: 0 })) }), intendedPositions: new Map([...base.intendedPositions, [10, ["middle"]]]) };
    const a = advisePicks(alone, explainCfg.settings);
    expect(a.picks[0]?.championId).toBe(usualPick(alone)?.championId);
    expect(a.whyNot).toBeNull();
  });

  it("returns empty advice when nothing fits", () => {
    expect(advisePicks({ ...base, comfort: new Map() }, explainCfg.settings)).toEqual({ picks: [], whyNot: null, confidence: null });
  });
});

describe("explanation helpers", () => {
  const t = { a: "{n} {n|game|games}, {wr:pct}% with {c:champion}", b: "plain" };
  it("renders values, percents, plurals and champion names; shows unknown ids", () => {
    const name = (id: number) => (id === 7 ? "Ahri" : "?");
    expect(renderReason({ id: "a", slots: { n: 1, wr: 0.555, c: 7 } }, t, name)).toBe("1 game, 56% with Ahri");
    expect(renderReason({ id: "a", slots: { n: 3, wr: 0.5, c: 7 } }, t, name)).toBe("3 games, 50% with Ahri");
    expect(renderReason({ id: "missing", slots: {} }, t, name)).toBe("missing");
  });

  it("every reason the engine emits has a template", () => {
    const ids = ["comfort.role", "comfort.roleWithAll", "comfort.otherRoles", "comfort.any", "mastery", "mastery.grades", "team.magic", "team.physical", "team.frontline", "team.engage", "offMeta", "offMeta.usual", "whyNot.unavailable", "whyNot.notPickable", "whyNot.offMeta", "whyNot.team.magic", "whyNot.team.physical", "whyNot.team.frontline", "whyNot.team.engage", "confidence.clear", "confidence.close", "confidence.thin", "meta.strong", "meta.weak", "lane.good", "lane.bad", "blind.safe", "blind.risky", "counter.good", "counter.bad", "synergy.good", "personal.new", "whyNot.meta", "whyNot.lane", "whyNot.counter", "whyNot.synergy", "whyNot.team", "whyNot.personal", "ban.counters", "ban.meta", "ban.popular", "ban.banRate", "trend.pick", "trend.win", "trend.both", "power.late", "power.early", "power.laneAhead", "power.laneBehind", "loadout.page", "loadout.page.matchup", "loadout.spells", "loadout.skills", "loadout.starting", "loadout.core.common", "loadout.item.winAdded", "loadout.item.winAdded.negative", "loadout.page.popular", "loadout.item.popular", "loadout.boots", "loadout.boots.popular", "loadout.boots.personal", "loadout.item.matchup", "loadout.starting.matchup", "loadout.page.personal", "loadout.spells.popular", "loadout.spells.personal", "loadout.core.personal", ...["item", "rune"].flatMap((k) => ["magic", "physical", "frontline", "engage", "heal"].map((t) => `loadout.${k}.lift.${t}`))];
    for (const id of ids) expect(explainCfg.templates, id).toHaveProperty([id]);
    const src = readdirSync(join(__dirname, "..", "src")).map((f) => readFileSync(join(__dirname, "..", "src", f), "utf8")).join("\n");
    for (const m of src.matchAll(/reason\("([\w.]+)"/g)) expect(ids, m[1]).toContain(m[1]);
  });

  it("labels confidence from sample size and score gap", () => {
    const s = explainCfg.settings;
    expect(confidenceOf({ score: 0.9, games: 1, masteryPoints: 0 }, { score: 0.1 }, s)).toBe("thin");
    expect(confidenceOf({ score: 0.9, games: 1, masteryPoints: 100_000 }, { score: 0.1 }, s)).toBe("clear");
    expect(confidenceOf({ score: 0.6, games: 10, masteryPoints: 0 }, { score: 0.58 }, s)).toBe("close");
    expect(confidenceOf({ score: 0.6, games: 10, masteryPoints: 0 }, undefined, s)).toBe("clear");
  });
});

describe("purity", () => {
  it("engine source has no network or filesystem imports", () => {
    const dir = join(__dirname, "..", "src");
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/from "node:|require\(|\bfetch\(|from "(fs|http|https|net)"/);
    }
  });
});

describe("role-aware comfort and off-meta picks", () => {
  // Mirrors a real profile: a jungle main whose jungle games are 3-4 months old (now played mid),
  // and a fun pick played 4x jungle this week + 4x bottom.
  const MAIN = 950;
  const FUN = 202;
  const games = [
    ...Array.from({ length: 15 }, (_, i) => game(MAIN, i < 9, 85 + i * 2, "jungle")),
    ...Array.from({ length: 9 }, (_, i) => game(MAIN, i < 3, 2, "middle")),
    ...Array.from({ length: 4 }, (_, i) => game(FUN, i < 2, 3, "jungle")),
    ...Array.from({ length: 4 }, (_, i) => game(FUN, i < 2, 5, "bottom")),
  ];
  const masteries = [
    { championId: MAIN, level: 19, points: 177_000, lastPlayTime: NOW, grades: ["S", "A+"] },
    { championId: FUN, level: 17, points: 158_000, lastPlayTime: NOW - 3 * DAY, grades: ["C"] },
  ];
  const intended = new Map<number, string[]>([[MAIN, ["jungle", "middle"]], [FUN, ["bottom"]]]);

  it("counts games in other roles only partly", () => {
    const all = computeComfort(games, masteries, NOW, engineCfg.comfort).get(FUN)!;
    const jungle = computeComfort(games, masteries, NOW, engineCfg.comfort, "jungle").get(FUN)!;
    expect(jungle.weightedGames).toBeLessThan(all.weightedGames);
    expect(jungle.gamesInRole).toBe(4);
    expect(jungle.games).toBe(8);
  });

  it("classifies role fit from Riot's positions, others' games, then the player's own games", () => {
    const comfort = computeComfort(games, masteries, NOW, engineCfg.comfort, "jungle");
    const min = engineCfg.roles;
    expect(roleFit(MAIN, comfort.get(MAIN)!, "jungle", intended, new Map(), min)).toBe("meta");
    expect(roleFit(FUN, comfort.get(FUN)!, "jungle", intended, new Map(), min)).toBe("offMeta");
    expect(roleFit(FUN, comfort.get(FUN)!, "top", intended, new Map(), min)).toBeNull();
  });

  it("ranks the real main above a fun pick, and tags the fun pick off-meta with a penalty", () => {
    const comfort = computeComfort(games, masteries, NOW, engineCfg.comfort, "jungle");
    const blind = draft({ myTeam: draft().myTeam.map((s) => ({ ...s, championId: 0, position: s.isLocalPlayer ? "jungle" : "" })) });
    const picks = recommendPicks({
      draft: blind, pickable: [], unavailable: new Set(), comfort, attributes: new Map(), intendedPositions: intended,
      role: "jungle", weights: weightsForBand(2, engineCfg), config: { ...engineCfg, topN: 5 },
    });
    expect(picks.map((p) => p.championId)).toEqual([MAIN, FUN]);
    const fun = picks[1]!;
    expect(fun.offMeta).toBe(true);
    expect(picks[0]!.offMeta).toBe(false);
    expect(text(fun.reasons)).toMatch(/Off-meta in jungle \(usually bottom\)/);
    expect(text(fun.reasons.slice(0, 1))).toMatch(/4 recent jungle games, 50% win rate \(8 games in all roles\)/);
    expect(text(picks[0]!.reasons)).toMatch(/grades S A\+/);
    const unpenalised = combineFactors(fun.factors, weightsForBand(2, engineCfg));
    expect(fun.score).toBeCloseTo(unpenalised * (1 - engineCfg.roles.offMetaPenalty));
  });

  it("leaves the player's own games out of champion role shares", () => {
    const own = Array.from({ length: 4 }, () => sample(FUN, { position: "jungle", self: true }));
    const others = Array.from({ length: 6 }, () => sample(FUN, { position: "bottom" }));
    const a = deriveChampionAttributes([...own, ...others], 3).get(FUN)!;
    expect(a.roleShares).toEqual({ bottom: 1 });
    expect(a.samples).toBe(10);
  });
});

describe("champion skill vs current form", () => {
  const cfg = engineCfg.comfort;
  const filler = Array.from({ length: 20 }, (_, i) => game(99, i % 2 === 0, 2, "jungle"));

  it("keeps an old main strong through mastery and long-window results", () => {
    const oldMain = Array.from({ length: 20 }, (_, i) => game(1, i < 13, 100, "jungle"));
    const c = computeComfort([...oldMain, ...filler], [
      { championId: 1, level: 20, points: 200_000, lastPlayTime: NOW - 100 * DAY },
      { championId: 99, level: 2, points: 10_000, lastPlayTime: NOW },
    ], NOW, cfg, "jungle").get(1)!;
    expect(c.skill).toBeGreaterThan(0.6);
    expect(c.form).toBeLessThan(c.skill);
  });

  it("fades mastery that hasn't been played for a long time", () => {
    const m = (last: number) => [
      { championId: 1, level: 10, points: 200_000, lastPlayTime: NOW - last * DAY },
      { championId: 2, level: 10, points: 100_000, lastPlayTime: NOW },
    ];
    const fresh = computeComfort([], m(1), NOW, cfg).get(1)!.skill;
    const stale = computeComfort([], m(720), NOW, cfg).get(1)!.skill;
    expect(stale).toBeLessThan(fresh / 2);
  });

  it("lets good grades lift and bad grades hold back the same mastery", () => {
    const m = (grades: string[]) => [
      { championId: 1, level: 10, points: 100_000, lastPlayTime: NOW, grades },
      { championId: 2, level: 10, points: 100_000, lastPlayTime: NOW },
    ];
    expect(computeComfort([], m(["S", "A+"]), NOW, cfg).get(1)!.skill).toBeGreaterThan(computeComfort([], m(["C", "D"]), NOW, cfg).get(1)!.skill);
    expect(gradeScore(["S+"], cfg.skill.gradeScale)).toBe(1);
    expect(gradeScore(["unknown"], cfg.skill.gradeScale)).toBeNull();
  });

  it("transfers skill to a new role when the meta moves a champion", () => {
    const midHistory = Array.from({ length: 20 }, (_, i) => game(1, i < 13, 20, "middle"));
    const m = [{ championId: 1, level: 15, points: 150_000, lastPlayTime: NOW }];
    const jungle = computeComfort([...midHistory, ...filler], m, NOW, cfg, "jungle").get(1)!;
    const middle = computeComfort([...midHistory, ...filler], m, NOW, cfg, "middle").get(1)!;
    expect(jungle.gamesInRole).toBe(0);
    expect(jungle.skill).toBeCloseTo(middle.skill); // skill carries over unchanged...
    expect(jungle.form).toBeLessThan(middle.form); // ...form in the new role starts lower
  });
});

describe("adviseRoles", () => {
  it("ranks roles by recent results and experience, with best champions per role", () => {
    const games = [
      ...Array.from({ length: 30 }, (_, i) => game(1, i < 19, 5, "jungle")),
      ...Array.from({ length: 10 }, (_, i) => game(2, i < 7, 5, "jungle")),
      ...Array.from({ length: 30 }, (_, i) => game(3, i < 11, 5, "middle")),
      game(4, true, 5, "top"),
    ];
    const advice = adviseRoles(games, [], NOW, engineCfg);
    expect(advice.map((a) => a.role)).toEqual(["jungle", "middle", "top"]);
    expect(advice[0]).toMatchObject({ games: 40, topChampions: [1, 2], enoughData: true });
    expect(advice[0]!.winRate).toBeCloseTo(26 / 40);
    // One lucky top game is "not enough data", listed last rather than recommended.
    expect(advice.find((a) => a.role === "top")!.enoughData).toBe(false);
  });

  it("returns nothing without games", () => {
    expect(adviseRoles([], [], NOW, engineCfg)).toEqual([]);
  });
});

describe("one-off games in a role (e.g. a single Naafiri bot game)", () => {
  const MID = 950;
  const ADC = 145;
  const games = [
    ...Array.from({ length: 30 }, (_, i) => game(MID, i < 17, 5, "middle")),
    game(MID, false, 3, "bottom"), // one-off
    ...Array.from({ length: 6 }, (_, i) => game(ADC, i < 4, 5, "bottom")),
  ];
  const masteries = [{ championId: MID, level: 19, points: 177_000, lastPlayTime: NOW, grades: ["S"] }];
  const intended = new Map<number, string[]>([[MID, ["jungle", "middle"]], [ADC, ["bottom"]]]);

  it("is not suggested off-meta below roles.offMetaMinGames", () => {
    const comfort = computeComfort(games, masteries, NOW, engineCfg.comfort, "bottom");
    expect(engineCfg.roles.offMetaMinGames).toBeGreaterThan(1);
    expect(roleFit(MID, comfort.get(MID)!, "bottom", intended, new Map(), engineCfg.roles)).toBeNull();
    const picks = recommendPicks({
      draft: draft({ myTeam: draft().myTeam.map((s) => ({ ...s, championId: 0, position: s.isLocalPlayer ? "bottom" : "" })) }),
      pickable: [], unavailable: new Set(), comfort, attributes: new Map(), intendedPositions: intended,
      role: "bottom", weights: weightsForBand(2, engineCfg), config: engineCfg,
    });
    expect(picks.map((p) => p.championId)).toEqual([ADC]);
  });

  it("is not listed as a best champion for that role in role advice", () => {
    const bottom = adviseRoles(games, masteries, NOW, engineCfg, intended).find((r) => r.role === "bottom")!;
    expect(bottom.topChampions).toEqual([ADC]);
    const middle = adviseRoles(games, masteries, NOW, engineCfg, intended).find((r) => r.role === "middle")!;
    expect(middle.topChampions).toEqual([MID]);
  });
});

describe("role shares from small samples", () => {
  it("only count as meta once the champion has been seen often enough", () => {
    const few = [...Array.from({ length: 8 }, () => sample(7, { position: "jungle" })), ...Array.from({ length: 2 }, () => sample(7, { position: "utility" }))];
    const many = [...Array.from({ length: 40 }, () => sample(7, { position: "jungle" })), ...Array.from({ length: 10 }, () => sample(7, { position: "utility" }))];
    const comfort = computeComfort([game(7, true, 1, "jungle")], [], NOW, engineCfg.comfort, "utility").get(7)!;
    const fit = (s: AttributeSample[]) => roleFit(7, comfort, "utility", new Map(), deriveChampionAttributes(s, 3), engineCfg.roles);
    expect(fit(few)).toBeNull(); // 2 of 10 is noise
    expect(fit(many)).toBe("meta"); // 10 of 50 is a real pattern
  });
});
