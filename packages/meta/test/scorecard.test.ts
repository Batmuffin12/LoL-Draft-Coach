import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEngineConfig } from "@ldc/engine";
import type { ChampionBuild, MatchSummary, ParticipantSummary } from "@ldc/shared";
import { auc, calibrationSlope, draftMetrics, draftRun, loadoutMetrics, pairedChange, parseMetaConfig, verdict, type Prediction } from "../src/index";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const read = (f: string) => JSON.parse(readFileSync(new URL(`../../../config/${f}`, import.meta.url), "utf8"));
const engine = parseEngineConfig(read("engine.v1.json"));
const aggregation = { ...parseMetaConfig(read("meta.v1.json")).aggregation, minPairGames: 1, minAttributeSamples: 1 };
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

const part = (championId: number, position: string, teamId: number, win: boolean, over: Partial<ParticipantSummary> = {}): ParticipantSummary => ({
  championId, teamId, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 1, magicDamage: 0, trueDamage: 0, damageTaken: 1, selfMitigated: 0, ccSeconds: 0,
  objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {}, ...over,
});

/** Champion 1 (top) wins 70% of its games against any top; the rest is noise. */
function matches(n: number): MatchSummary[] {
  return Array.from({ length: n }, (_, k) => {
    const oneIsBlue = k % 2 === 0;
    const oneWins = k % 10 < 7;
    const blueWins = oneIsBlue === oneWins;
    const blue = [oneIsBlue ? 1 : 2 + (k % 3), 10 + (k % 7), 20 + (k % 5), 30 + (k % 6), 40 + (k % 4)];
    const red = [oneIsBlue ? 2 + (k % 3) : 1, 50 + (k % 7), 60 + (k % 5), 70 + (k % 6), 80 + (k % 4)];
    return {
      matchId: `M${k}`, queueId: 420, gameVersion: "16.19.1", endedAt: NOW - (n - k) * (DAY / 50), durationSec: 1800,
      participants: [...blue.map((c, i) => part(c, ROLES[i]!, 100, blueWins)), ...red.map((c, i) => part(c, ROLES[i]!, 200, !blueWins))],
    };
  });
}

const preds = (pairs: [number, boolean][]): Prediction[] => pairs.map(([p, won], i) => ({ p, won, matchId: `G${i}` }));

describe("scorecard numbers", () => {
  it("AUC: 1 when every winner is above every loser, 0.5 when the order says nothing", () => {
    expect(auc(preds([[0.6, true], [0.7, true], [0.4, false], [0.3, false]]))).toBe(1);
    expect(auc(preds([[0.5, true], [0.5, false]]))).toBe(0.5);
  });

  it("calibration slope: about 1 for honest predictions, above 1 for timid ones", () => {
    const honest: Prediction[] = [];
    for (let i = 0; i < 2000; i++) {
      const p = 0.3 + 0.4 * ((i * 7919) % 1000) / 1000;
      honest.push({ p, won: ((i * 104729) % 1000) / 1000 < p, matchId: `H${i}` });
    }
    expect(calibrationSlope(honest)).toBeCloseTo(1, 0);
    const timid = honest.map((x) => ({ ...x, p: 0.5 + (x.p - 0.5) / 3 }));
    expect(calibrationSlope(timid)).toBeGreaterThan(2);
  });

  it("verdict: better or worse only when the interval leaves 0 on one side", () => {
    expect(verdict({ value: -0.01, n: 1, better: "lower", lo: -0.02, hi: -0.001 })).toBe("better");
    expect(verdict({ value: 0.01, n: 1, better: "lower", lo: 0.001, hi: 0.02 })).toBe("worse");
    expect(verdict({ value: -0.01, n: 1, better: "lower", lo: -0.02, hi: 0.003 })).toBe("same");
    expect(verdict({ value: 0.05, n: 1, better: "higher", lo: 0.01, hi: 0.09 })).toBe("better");
  });
});

describe("draft run", () => {
  const all = matches(1200);
  const run = draftRun(all, 2, aggregation, engine, [], { folds: 3, foldGames: 200 });

  it("predicts the newest folds, each from the games before it, once per game", () => {
    expect(run.games).toHaveLength(600);
    expect(new Set(run.games.map((g) => g.matchId)).size).toBe(600);
    expect(run.games.map((g) => g.matchId)[0]).toBe("M600");
    expect(run.picks.length).toBe(6000);
  });

  it("the shipped terms (champion strength) beat the side-only baseline on the strong champion", () => {
    const m = draftMetrics(run, "draft.b2");
    expect(m["draft.b2.gainVsSide"]!.value).toBeLessThan(0);
    expect(verdict(m["draft.b2.gainVsSide"]!)).toBe("better");
    expect(m["draft.b2.auc"]!.value).toBeGreaterThan(0.55);
  });

  it("a paired change compares two configs on the same games", () => {
    const weaker = { ...engine, rating: { ...engine.rating, priorGames: { ...engine.rating.priorGames, meta: 100_000 } } };
    const flat = draftRun(all, 2, aggregation, weaker, [], { folds: 3, foldGames: 200 });
    expect(verdict(pairedChange(flat.games, run.games))).toBe("worse");
  });
});

describe("loadout metrics", () => {
  const page = (keystone: number, games: number, wins: number) => ({ primaryStyle: 8000, subStyle: 8400, runes: [keystone, 2, 3, 4, 5, 6], statPerks: [1, 2, 3], games, wins, n: games });
  const build = {
    championId: 1, role: "top", n: 1000, timelineN: 0, games: 1000, wins: 500,
    pages: [page(8010, 600, 300), page(8005, 300, 180)],
    spells: [{ spells: [4, 12], games: 900, wins: 450, n: 900 }],
    skills: [], starting: [], core: [], items: [], lifts: [], matchupPages: [],
  } as ChampionBuild;
  const perks = (keystone: number) => ({ primaryStyle: 8000, subStyle: 8400, runes: [keystone, 2, 3, 4, 5, 6], statPerks: [1, 2, 3] });
  // Four test players on champion 1: the most taken page wins 1 of 2, the "best" page 1 of 2.
  const test: MatchSummary[] = [
    [8010, true], [8010, false], [8005, true], [8005, false],
  ].map(([k, win], i) => ({
    matchId: `T${i}`, queueId: 420, gameVersion: "16.19.1", endedAt: NOW, durationSec: 1800,
    participants: [part(1, "top", 100, win as boolean, { perks: perks(k as number), spells: [12, 4] })],
  }));
  const builds = new Map([["1|top", build]]);

  it("as shipped, counts who took the most taken page and how they did", () => {
    const m = loadoutMetrics(builds, test, engine.loadout);
    expect(m["loadout.page.taken"]!.value).toBe(0.5);
    expect(m["loadout.page.delivered"]!.value).toBe(0);
    expect(m["loadout.spells.taken"]!.value).toBe(1);
  });

  it("by win rate, shows what the page promised next to what it delivered", () => {
    const m = loadoutMetrics(builds, test, { ...engine.loadout, pickBy: "winRate" });
    expect(m["loadout.page.promised"]!.value).toBeGreaterThan(0.05);
    expect(m["loadout.page.delivered"]!.value).toBe(0);
  });
});
