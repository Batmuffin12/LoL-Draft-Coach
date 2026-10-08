import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEngineConfig } from "@ldc/engine";
import type { MatchSummary, ParticipantSummary } from "@ldc/shared";
import {
  draftGames,
  ENGINE_AS_IS,
  expectedCalibrationError,
  fitDraftModel,
  indexAsOf,
  only,
  pairedLogLossInterval,
  parseMetaConfig,
  predictDrafts,
  score,
  sideOnly,
  splitByTime,
  type DraftGame,
} from "../src/index";

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

/** Top lane decides: champion 1 beats 2 in 80% of games, and sides swap so blue isn't always 1. */
function matches(n: number): MatchSummary[] {
  return Array.from({ length: n }, (_, k) => {
    const oneIsBlue = k % 2 === 0;
    const oneWins = k % 5 !== 0;
    const blueWins = oneIsBlue === oneWins;
    const blue = [oneIsBlue ? 1 : 2, 10 + (k % 7), 20 + (k % 5), 30 + (k % 6), 40 + (k % 4)];
    const red = [oneIsBlue ? 2 : 1, 50 + (k % 7), 60 + (k % 5), 70 + (k % 6), 80 + (k % 4)];
    return {
      matchId: `M${k}`,
      queueId: 420,
      gameVersion: "16.19.1",
      endedAt: NOW - (n - k) * (DAY / 20),
      durationSec: 1800,
      participants: [...blue.map((c, i) => part(c, ROLES[i]!, 100, blueWins)), ...red.map((c, i) => part(c, ROLES[i]!, 200, !blueWins))],
    };
  });
}

describe("draft-level backtest", () => {
  const all = matches(400);
  const { train, valid, test } = splitByTime(all, 0.2, 0.2);

  it("splits by time: train, then validation, newest last", () => {
    expect([train.length, valid.length, test.length]).toEqual([240, 80, 80]);
    expect(Math.max(...train.map((m) => m.endedAt))).toBeLessThan(Math.min(...valid.map((m) => m.endedAt)));
    expect(Math.max(...valid.map((m) => m.endedAt))).toBeLessThan(Math.min(...test.map((m) => m.endedAt)));
  });

  it("makes one prediction per game, and the engine's lane term beats the side-only baseline", () => {
    const index = indexAsOf([...train, ...valid], 2, aggregation, engine);
    const games = draftGames(index, test, 2, engine);
    expect(games).toHaveLength(test.length);
    const asIs = predictDrafts(games, ENGINE_AS_IS);
    const side = predictDrafts(games, sideOnly(draftGames(index, train, 2, engine)));
    expect(score(asIs).logLoss).toBeLessThan(score(side).logLoss);
    const [lo, hi] = pairedLogLossInterval(asIs, side);
    expect(hi).toBeLessThan(0);
    expect(lo).toBeLessThan(hi);
  });

  it("fits term weights on validation games that predict held-out games at least as well", () => {
    const trainIndex = indexAsOf(train, 2, aggregation, engine);
    const fitted = fitDraftModel(draftGames(trainIndex, valid, 2, engine));
    expect(fitted.weights.lane).toBeGreaterThan(0);
    const testGames = draftGames(indexAsOf([...train, ...valid], 2, aggregation, engine), test, 2, engine);
    expect(score(predictDrafts(testGames, fitted)).logLoss).toBeLessThan(score(predictDrafts(testGames, only(ENGINE_AS_IS, []))).logLoss);
  });

  it("keeps weights near 1 when the games carry no signal, and finds the side bias", () => {
    const noise: DraftGame[] = Array.from({ length: 600 }, (_, i) => ({
      matchId: `N${i}`,
      blueWon: i % 5 < 3, // blue wins 60%
      x: { meta: ((i * 37) % 11) - 5, lane: ((i * 13) % 7) - 3, counter: 0, synergy: 0, team: ((i * 7) % 5) - 2 },
    }));
    const m = fitDraftModel(noise, 1e6);
    for (const w of Object.values(m.weights)) expect(Math.abs(w - 1)).toBeLessThan(0.05);
    expect(m.intercept).toBeGreaterThan(50); // 60% ≈ +70 rating points
  });

  it("measures calibration: a calibrated set scores near 0, an overconfident one higher", () => {
    const calibrated = Array.from({ length: 1000 }, (_, i) => ({ p: 0.3 + (i % 5) * 0.1, won: (i * 7919) % 100 < (0.3 + (i % 5) * 0.1) * 100 }));
    const overconfident = calibrated.map((x) => ({ ...x, p: x.p > 0.5 ? 0.95 : x.p < 0.5 ? 0.05 : 0.5 }));
    expect(expectedCalibrationError(calibrated)).toBeLessThan(0.05);
    expect(expectedCalibrationError(overconfident)).toBeGreaterThan(expectedCalibrationError(calibrated));
    expect(pairedLogLossInterval(calibrated, calibrated)).toEqual([0, 0]);
  });
});
