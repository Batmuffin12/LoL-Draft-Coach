import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEngineConfig } from "@ldc/engine";
import type { MatchSummary, ParticipantSummary } from "@ldc/shared";
import { calibration, draftFor, logLossGainInterval, onlyTerms, parseMetaConfig, predict, prepareBacktest, score } from "../src/index";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const read = (f: string) => JSON.parse(readFileSync(new URL(`../../../config/${f}`, import.meta.url), "utf8"));
const engine = parseEngineConfig(read("engine.v1.json"));
const aggregation = { ...parseMetaConfig(read("meta.v1.json")).aggregation, minPairGames: 1, minAttributeSamples: 1 };
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

const part = (championId: number, position: string, teamId: number, win: boolean): ParticipantSummary => ({
  championId, teamId, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 1, magicDamage: 0, trueDamage: 0, damageTaken: 1, selfMitigated: 0, ccSeconds: 0,
  objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {},
});

/**
 * Top lane: champion 1 (blue) beats 2 (red) 80% of the time; everything else is a coin
 * flip decided by that lane. Other roles use rotating champions so nothing else predicts.
 */
function matches(n: number): MatchSummary[] {
  return Array.from({ length: n }, (_, k) => {
    const blueWins = k % 5 !== 0;
    const blue = [1, 10 + (k % 7), 20 + (k % 5), 30 + (k % 6), 40 + (k % 4)];
    const red = [2, 50 + (k % 7), 60 + (k % 5), 70 + (k % 6), 80 + (k % 4)];
    return {
      matchId: `M${k}`,
      queueId: 420,
      gameVersion: "16.19.1",
      endedAt: NOW - (n - k) * (DAY / 10),
      durationSec: 1800,
      participants: [...blue.map((c, i) => part(c, ROLES[i]!, 100, blueWins)), ...red.map((c, i) => part(c, ROLES[i]!, 200, !blueWins))],
    };
  });
}

describe("scores", () => {
  it("scores a coin flip as ln 2 and a perfect forecast near 0", () => {
    expect(score([{ p: 0.5, won: true }, { p: 0.5, won: false }]).logLoss).toBeCloseTo(Math.log(2));
    expect(score([{ p: 0.5, won: true }]).brier).toBeCloseTo(0.25);
    const sharp = score([{ p: 0.99, won: true }, { p: 0.01, won: false }]);
    expect(sharp.logLoss).toBeLessThan(0.02);
    expect(sharp.accuracy).toBe(1);
  });

  it("counts accuracy only over predictions that lean one way", () => {
    const s = score([{ p: 0.5, won: true }, { p: 0.6, won: true }, { p: 0.4, won: true }]);
    expect([s.decided, s.accuracy]).toEqual([2, 0.5]);
  });

  it("gives a game-level interval that excludes 0 only for a real edge", () => {
    const game = (k: number, p: number, wonShare: number) =>
      Array.from({ length: 10 }, (_, i) => ({ p, won: i < wonShare * 10, matchId: `G${k}` }));
    const coin = Array.from({ length: 50 }, (_, k) => game(k, 0.5, 0.5)).flat();
    const [lo, hi] = logLossGainInterval(coin);
    expect(lo).toBeCloseTo(0);
    expect(hi).toBeCloseTo(0);
    const sharp = Array.from({ length: 50 }, (_, k) => game(k, 0.8, 0.8)).flat();
    expect(logLossGainInterval(sharp)[1]).toBeLessThan(0);
  });

  it("buckets predictions for calibration", () => {
    const bins = calibration([{ p: 0.51, won: true }, { p: 0.52, won: false }, { p: 0.6, won: true }], 0.05);
    expect(bins.map((b) => [b.n, b.actualWinRate])).toEqual([[2, 0.5], [1, 1]]);
  });
});

describe("draftFor", () => {
  it("rebuilds the draft from the player's side: allies positioned, enemies not, own seat empty", () => {
    const d = draftFor(matches(1)[0]!, 7);
    expect(d.myTeam.find((s) => s.isLocalPlayer)).toMatchObject({ cellId: 7, championId: 0, position: "middle" });
    expect(d.myTeam).toHaveLength(5);
    expect(d.theirTeam.every((s) => s.position === "" && s.championId > 0)).toBe(true);
  });
});

describe("backtest", () => {
  it("beats a coin flip when the data holds a real effect, and the lane term is what carries it", () => {
    const bt = prepareBacktest({ band: 2, matches: matches(400), testShare: 0.25, aggregation, engine });
    expect([bt.train, bt.test]).toEqual([300, 100]);
    const all = score(predict(bt.index, bt.testMatches, 2, bt.engine));
    expect(all.n).toBe(1000);
    expect(all.logLoss).toBeLessThan(Math.log(2));
    const metaOnly = score(predict(bt.index, bt.testMatches, 2, onlyTerms(bt.engine, ["meta"])));
    const noTerms = score(predict(bt.index, bt.testMatches, 2, onlyTerms(bt.engine, [])));
    expect(noTerms.logLoss).toBeCloseTo(Math.log(2));
    expect(all.logLoss).toBeLessThanOrEqual(metaOnly.logLoss + 1e-9);
  });
});
