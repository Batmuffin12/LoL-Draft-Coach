import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { monthlyReport, parseEngineConfig, parseRankBandConfig } from "../src/index";

const read = (n: string) => JSON.parse(readFileSync(new URL(`../../../config/${n}`, import.meta.url), "utf8"));
const engine = parseEngineConfig(read("engine.v1.json"));
const bands = parseRankBandConfig(read("rank-bands.v1.json"));
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const cfg = { report: { days: 30, maxChampions: 4, minPriorGames: 5 }, playstyle: { ...engine.playstyle, minGamesPerRole: 3, minMetrics: 1, minReferenceSamples: 3, axes: { farming: { metrics: ["csPerMinute"] } } } };

const player = (championId: number, win: boolean, cs: number): ParticipantSummary =>
  ({ championId, teamId: 100, position: "middle", win, kills: 0, deaths: 0, assists: 0, cs, gold: 0, visionScore: 0, physicalDamage: 0, magicDamage: 0, trueDamage: 0, damageTaken: 0, selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {} }) as ParticipantSummary;
/** A mid game `daysAgo` days ago: you on `championId` farming `cs`; the other mid farms 70 (the reference). */
const game = (daysAgo: number, championId: number, win: boolean, cs: number): UserMatch => ({
  match: { matchId: `EUW1_${daysAgo}_${championId}_${cs}`, queueId: 420, gameVersion: "16.19", endedAt: NOW - daysAgo * DAY, durationSec: 600, participants: [player(championId, win, cs), player(1, !win, 70)] },
  me: 0,
});

describe("monthlyReport", () => {
  // Before the month: 10 Ahri games, 4 wins, farming 55. This month: 8 Ahri games, 6 wins, farming 80; 2 Ekko games.
  const matches = [
    ...Array.from({ length: 10 }, (_, i) => game(35 + i, 103, i < 4, 55)),
    ...Array.from({ length: 8 }, (_, i) => game(1 + i, 103, i < 6, 80)),
    game(3, 245, false, 60),
    game(4, 245, true, 60),
  ];

  it("compares the month with your games before it: win rate, champion form and style", () => {
    const r = monthlyReport(matches, NOW, cfg, { bands });
    expect(r.games).toBe(10);
    expect(r.winRate).toBeCloseTo(0.7);
    expect(r.winRateBefore).toBeCloseTo(0.4);
    expect(r.role).toBe("middle");
    expect(r.champions).toEqual([
      { championId: 103, games: 8, winRate: 0.75, change: expect.closeTo(0.35) },
      { championId: 245, games: 2, winRate: 0.5, change: null },
    ]);
    const farming = r.axes.find((a) => a.axis === "farming")!;
    expect(farming.to).toBeGreaterThan(farming.from!);
  });

  it("takes your rank at the start and now from the rank history, in your main ranked queue", () => {
    const day = (d: number) => new Date(NOW - d * DAY).toISOString().slice(0, 10);
    const rankHistory = [
      { day: day(40), queueType: "RANKED_SOLO_5x5", tier: "SILVER", rank: "I" },
      { day: day(10), queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "IV" },
      { day: day(1), queueType: "RANKED_FLEX_SR", tier: "IRON", rank: "II" },
    ];
    const r = monthlyReport(matches, NOW, cfg, { bands, rankHistory });
    expect(r.rank).toEqual({ start: { tier: "SILVER", rank: "I" }, now: { tier: "GOLD", rank: "IV" }, direction: "up" });
    expect(monthlyReport(matches, NOW, cfg, { bands }).rank).toEqual({ start: null, now: null, direction: null });
  });
});
