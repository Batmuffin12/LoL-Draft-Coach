import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DraftState } from "@ldc/shared";
import {
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
  scoreTeamNeeds,
  teamProfile,
  weightsForBand,
  type AttributeSample,
  type PlayerGame,
} from "../src/index";

const CONFIG_DIR = join(__dirname, "..", "..", "..", "config");
const readJson = (f: string) => JSON.parse(readFileSync(join(CONFIG_DIR, f), "utf8"));
const engineCfg = parseEngineConfig(readJson("engine.v1.json"));
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
    expect(mage.reasons.join(" ")).toMatch(/magic damage/);
  });

  it("prefers a tank when the team has no frontline", () => {
    const profile = teamProfile([2, 4], attrs); // mage + ADC, both squishy
    const tank = scoreTeamNeeds(attrs.get(3), profile, cfg);
    const adc = scoreTeamNeeds(attrs.get(4), profile, cfg);
    expect(tank.score!).toBeGreaterThan(adc.score!);
    expect(tank.reasons.join(" ")).toMatch(/frontline/);
  });

  it("does not ask for frontline when a measured bruiser is already there", () => {
    const tank = scoreTeamNeeds(attrs.get(3), teamProfile([1, 4], attrs), cfg);
    expect(tank.reasons.join(" ")).not.toMatch(/frontline/);
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
  const comfort = computeComfort(games, [], NOW, engineCfg.comfort);
  const base = {
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
    expect(picks[0]!.reasons[0]).toMatch(/recent games, \d+% win rate/);
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
