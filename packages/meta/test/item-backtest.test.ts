import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEngineConfig } from "@ldc/engine";
import { ITEM_BOUGHT, type MatchSummary, type ParticipantSummary } from "@ldc/shared";
import { backtestItems, parseMetaConfig } from "../src/index";

const NOW = 1_800_000_000_000;
const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../config/${name}`, import.meta.url), "utf8"));
const meta = parseMetaConfig(read("meta.v1.json"));
const loadout = parseEngineConfig(read("engine.v1.json")).loadout;
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

const participant = (championId: number, position: string, teamId: number, win: boolean): ParticipantSummary => ({
  championId, teamId, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 100, magicDamage: 100, trueDamage: 0, damageTaken: 100, selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0,
  items: [], spells: [4, 14], perks: null, challenges: {},
});

/** Champion 1 (top, blue) buys `item` first; everyone's gold is even, so the expected win is ~50%. */
function game(id: string, item: number, win: boolean, ageHours: number): MatchSummary {
  const participants = [
    ...[1, 2, 3, 4, 5].map((c, i) => participant(c, ROLES[i]!, 100, win)),
    ...[11, 12, 13, 14, 15].map((c, i) => participant(c, ROLES[i]!, 200, !win)),
  ];
  return {
    matchId: id,
    queueId: 420,
    gameVersion: "16.19.1",
    endedAt: NOW - ageHours * 3_600_000,
    durationSec: 1800,
    participants,
    timeline: {
      gold: participants.map(() => Array.from({ length: 30 }, (_, f) => f * 400)),
      items: [[0, 700, ITEM_BOUGHT, item]],
      skills: participants.map(() => []),
    },
  };
}

describe("backtestItems", () => {
  it("scores held-out purchases: hit rates against the most-bought baseline, and win added when agreeing with us", () => {
    // Training: 3007 is bought more (60%) but loses; 3006 (40%) wins.
    const train: MatchSummary[] = [];
    for (let i = 0; i < 60; i++) train.push(game(`a${i}`, 3007, i % 4 === 0, 48 + i));
    for (let i = 0; i < 40; i++) train.push(game(`b${i}`, 3006, i % 4 !== 0, 48 + i));
    // Held out: the same pattern.
    const test: MatchSummary[] = [];
    for (let i = 0; i < 6; i++) test.push(game(`c${i}`, 3007, i % 3 === 0, 1));
    for (let i = 0; i < 4; i++) test.push(game(`d${i}`, 3006, true, 1));
    const r = backtestItems({ train, test, now: NOW, meta: { ...meta, builds: { ...meta.builds, minGames: 1 } }, loadout, completed: new Set([3006, 3007]) });
    expect(r.purchases).toBe(10);
    expect(r.ranked.top1).toBeCloseTo(0.4);
    expect(r.popular.top1).toBeCloseTo(0.6);
    expect(r.ranked.top3).toBe(1);
    expect(r.agree.n).toBe(4);
    expect(r.agree.winAdded).toBeGreaterThan(0.3);
    expect(r.disagree.winAdded).toBeLessThan(0);
  });
});
