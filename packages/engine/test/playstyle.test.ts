import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { computePlaystyle, empiricalPercentile, parseEngineConfig, percentileFromQuantiles, playstyleRoles, readMetric } from "../src/index";

const cfg = parseEngineConfig(JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "config", "engine.v1.json"), "utf8"))).playstyle;
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const p = (position: string, extra: Partial<ParticipantSummary> = {}, challenges: Record<string, number> = {}): ParticipantSummary => ({
  championId: 1, teamId: 100, position, win: true, kills: 2, deaths: 5, assists: 5, cs: 150, gold: 9000, visionScore: 20,
  physicalDamage: 10000, magicDamage: 1000, trueDamage: 0, damageTaken: 15000, selfMitigated: 5000, ccSeconds: 10,
  objectiveDamage: 5000, items: [], spells: [], perks: null, challenges, ...extra,
});

/**
 * n jungle games: the player has high kill participation and few deaths; the enemy
 * jungler (the reference) has low kill participation and many deaths. Both farm the same.
 */
function games(n: number, role = "jungle"): UserMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    me: 0,
    match: {
      matchId: `EUW1_${i}`, queueId: 420, gameVersion: "x", endedAt: NOW - i * DAY, durationSec: 1800,
      participants: [
        p(role, { deaths: 2 }, { killParticipation: 0.7 + (i % 3) * 0.01, teamDamagePercentage: 0.25, damagePerMinute: 700, soloKills: 2, goldPerMinute: 380 + (i % 4), deathsByEnemyChamps: 2 }),
        p("top"),
        p(role, { deaths: 8, teamId: 200 }, { killParticipation: 0.4 + (i % 5) * 0.02, teamDamagePercentage: 0.15, damagePerMinute: 400, soloKills: 0, goldPerMinute: 380 + (i % 4), deathsByEnemyChamps: 8 }),
        p("middle", { teamId: 200 }),
      ],
    },
  }));
}

describe("playstyle", () => {
  it("reads Riot metrics and derived per-minute values; null when missing", () => {
    const x = p("jungle", { cs: 300, deaths: 6 }, { killParticipation: 0.5 });
    expect(readMetric(x, 1800, "challenges.killParticipation")).toBe(0.5);
    expect(readMetric(x, 1800, "csPerMinute")).toBe(10);
    expect(readMetric(x, 1800, "deathsPerMinute")).toBeCloseTo(0.2);
    expect(readMetric(x, 1800, "challenges.notThere")).toBeNull();
    expect(readMetric(x, 1800, "unknownMetric")).toBeNull();
  });

  it("reads the gold lead on your lane opponent at 14 min from the timeline", () => {
    const me = p("middle", { teamId: 100 });
    const ally = p("jungle", { teamId: 100 });
    const opp = p("middle", { teamId: 200 });
    const frames = (at14: number) => Array.from({ length: 16 }, (_, i) => (i === 14 ? at14 : i * 300));
    const match = { participants: [me, ally, opp], timeline: { gold: [frames(5600), frames(5000), frames(5100)], items: [], skills: [] } };
    expect(readMetric(me, 1800, "laneGoldDiffAt14", match)).toBe(500);
    expect(readMetric(opp, 1800, "laneGoldDiffAt14", match)).toBe(-500);
    expect(readMetric(me, 1800, "laneGoldDiffAt14")).toBeNull(); // no match
    expect(readMetric(me, 1800, "laneGoldDiffAt14", { participants: match.participants })).toBeNull(); // no timeline
    expect(readMetric(ally, 1800, "laneGoldDiffAt14", match)).toBeNull(); // no opponent in the position
    const short = { ...match, timeline: { ...match.timeline, gold: match.timeline.gold.map((g) => g.slice(0, 10)) } };
    expect(readMetric(me, 1800, "laneGoldDiffAt14", short)).toBeNull(); // ended before minute 14
  });

  it("computes percentiles with ties counted as half", () => {
    expect(empiricalPercentile(5, [1, 2, 3, 4])).toBe(1);
    expect(empiricalPercentile(0, [1, 2, 3, 4])).toBe(0);
    expect(empiricalPercentile(2, [1, 2, 2, 3])).toBe(0.5);
  });

  it("scores a fighter who rarely dies high on fighting and risk control, against their lane opponents", () => {
    const ps = computePlaystyle(games(30), "jungle", NOW, cfg)!;
    expect(ps).toMatchObject({ role: "jungle", games: 30, referenceSamples: 30 });
    const axis = (name: string) => ps.axes.find((a) => a.axis === name);
    expect(axis("fighting")!.score).toBeGreaterThan(0.9);
    expect(axis("riskControl")!.score).toBeGreaterThan(0.9);
    // Same farm as the reference: around the middle.
    expect(axis("farming")!.score).toBeCloseTo(0.5, 1);
    const kp = axis("fighting")!.metrics.find((m) => m.metric === "challenges.killParticipation")!;
    expect(kp.you).toBeGreaterThan(kp.reference);
    expect(axis("riskControl")!.metrics[0]).toMatchObject({ metric: "deathsPerMinute", lowerIsBetter: true });
  });

  it("leaves out axes whose metrics the games don't carry", () => {
    const ps = computePlaystyle(games(30), "jungle", NOW, cfg)!;
    // No vision challenges and visionScore is identical, so vision is only from... nothing configured it can read twice.
    expect(ps.axes.map((a) => a.axis)).not.toContain("roaming");
  });

  it("says nothing below the minimum games or reference samples", () => {
    expect(computePlaystyle(games(cfg.minGamesPerRole - 1), "jungle", NOW, cfg)).toBeNull();
    expect(computePlaystyle(games(30), "bottom", NOW, cfg)).toBeNull();
    expect(computePlaystyle(games(30), "", NOW, cfg)).toBeNull();
  });

  it("lists the roles with enough games, most played first", () => {
    expect(playstyleRoles([...games(10, "middle"), ...games(20, "jungle"), ...games(2, "top")], cfg)).toEqual(["jungle", "middle"]);
  });
});

describe("playstyle against band references (live meta)", () => {
  it("interpolates percentiles from quantiles, with runs of equal values at their middle", () => {
    expect(percentileFromQuantiles(5, [0, 10, 20])).toBe(0.25);
    expect(percentileFromQuantiles(-1, [0, 10, 20])).toBe(0);
    expect(percentileFromQuantiles(99, [0, 10, 20])).toBe(1);
    expect(percentileFromQuantiles(0, [0, 0, 0, 10, 20])).toBe(0.25);
    expect(percentileFromQuantiles(3, [3])).toBe(0.5);
  });

  it("uses the band's references when the snapshot has them, else the player's own games", () => {
    // In the band, kill participation 0.7 is only the median: the player is average there.
    const band = { "challenges.killParticipation": { n: 5000, quantiles: [0.2, 0.5, 0.7, 0.8, 0.95] } };
    const ps = computePlaystyle(games(30), "jungle", NOW, cfg, band)!;
    expect(ps.reference).toBe("band");
    expect(ps.referenceSamples).toBe(5000);
    const kp = ps.axes.find((a) => a.axis === "fighting")!.metrics.find((m) => m.metric === "challenges.killParticipation")!;
    expect(kp.percentile).toBeGreaterThan(0.5);
    expect(kp.percentile).toBeLessThan(0.6);
    expect(kp.reference).toBe(0.7);
    // Too few band samples: back to the lane opponents in the player's games.
    expect(computePlaystyle(games(30), "jungle", NOW, cfg, { "challenges.killParticipation": { n: 3, quantiles: [0, 1] } })!.reference).toBe("games");
  });
});
