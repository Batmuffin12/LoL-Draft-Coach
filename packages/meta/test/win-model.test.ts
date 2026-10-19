import { describe, expect, it } from "vitest";
import { ITEM_BOUGHT, ITEM_DESTROYED, type MatchSummary, type ParticipantSummary } from "@ldc/shared";
import { fitWinModel, score, scoreboardAt, winChance, winModelPredictions } from "../src/index";

const part = (teamId: number, win: boolean): ParticipantSummary => ({
  championId: 1, teamId, position: "top", win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 1, magicDamage: 0, trueDamage: 0, damageTaken: 1, selfMitigated: 0, ccSeconds: 0,
  objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {},
});
const gold = (id: number) => (id === 1001 ? 300 : id === 3006 ? 1100 : 0);

/** A 1v1 "game" of 21 minutes: blue leads by `lead` levels and kills from minute 5, and wins when lead > 0 (with noise). */
function game(k: number, lead: number, blueWins: boolean): MatchSummary {
  const frames = (base: number, d: number) => Array.from({ length: 22 }, (_, f) => base + (f >= 5 ? d : 0));
  return {
    matchId: `G${k}`, queueId: 420, gameVersion: "16.19.1", endedAt: k, durationSec: 21 * 60,
    participants: [part(100, blueWins), part(200, !blueWins)],
    timeline: {
      gold: [[], []],
      items: [[0, 60, ITEM_BOUGHT, 1001], [1, 60, ITEM_BOUGHT, 1001], [0, 400, ITEM_BOUGHT, 3006], [0, 400, ITEM_DESTROYED, 1001]],
      skills: [[], []],
      levels: [frames(5, Math.max(0, lead)), frames(5, Math.max(0, -lead))],
      cs: [frames(50, 0), frames(50, 0)],
      kills: lead > 0 ? [[290, 0, 1, 0]] : lead < 0 ? [[290, 1, 0, 0]] : [],
      monsters: [[600, 0, 0, 100]],
    },
  };
}

describe("in-game win model", () => {
  it("reads the scoreboard at a minute: kills from deaths, levels, CS, held items' value, monsters", () => {
    const g = game(0, 2, true);
    expect(scoreboardAt(g, 3, gold)).toEqual([0, 0, 0, 0, 0]);
    // Minute 10: blue's Boots (1,100, its Boots part used up) vs red's Boots part (300); one kill; a monster at 600 s.
    expect(scoreboardAt(g, 10, gold)).toEqual([1, 2, 0, 0.8, 1]);
    expect(scoreboardAt(g, 30, gold)).toBeNull();
  });

  it("learns that a lead wins, and beats the side-only baseline on new games", () => {
    const games = Array.from({ length: 600 }, (_, k) => {
      const lead = (k % 5) - 2;
      return game(k, lead, lead > 0 ? k % 10 !== 0 : lead < 0 ? k % 10 === 0 : k % 2 === 0);
    });
    const model = fitWinModel(games.slice(0, 400), [5, 10, 15], gold);
    expect(winChance(model, 12, [1, 2, 0, 0, 0])).toBeGreaterThan(0.6);
    expect(winChance(model, 12, [-1, -2, 0, 0, 0])).toBeLessThan(0.4);
    const { model: p, side } = winModelPredictions(model, games.slice(400), 10, gold);
    expect(p).toHaveLength(200);
    expect(score(p).logLoss).toBeLessThan(score(side).logLoss);
  });
});
