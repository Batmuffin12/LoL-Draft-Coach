import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEngineConfig } from "@ldc/engine";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { experienceCurve, indexAsOf, parseMetaConfig, personalGames, personalPredictions, score } from "../src/index";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const read = (f: string) => JSON.parse(readFileSync(new URL(`../../../config/${f}`, import.meta.url), "utf8"));
const engine = parseEngineConfig(read("engine.v1.json"));
const aggregation = parseMetaConfig(read("meta.v1.json")).aggregation;
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

const part = (championId: number, position: string, teamId: number, win: boolean): ParticipantSummary => ({
  championId, teamId, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 1, magicDamage: 0, trueDamage: 0, damageTaken: 1, selfMitigated: 0, ccSeconds: 0,
  objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {},
});

/** A mid player: champion 1 wins 4 of 5 games, champion 2 wins 1 of 5; one game a day. */
function history(n: number): UserMatch[] {
  return Array.from({ length: n }, (_, k) => {
    const champ = k % 2 ? 1 : 2;
    const win = champ === 1 ? k % 5 !== 0 : k % 5 === 0;
    const blue = ROLES.map((r, i) => part(r === "middle" ? champ : 10 + i, r, 100, win));
    const red = ROLES.map((r, i) => part(20 + i, r, 200, !win));
    return { match: { matchId: `U${k}`, queueId: 420, gameVersion: "16.19.1", endedAt: NOW - (n - k) * DAY, durationSec: 1800, participants: [...blue, ...red] }, me: 2 };
  });
}

describe("personal backtest", () => {
  const games = personalGames([history(120)], indexAsOf([], 2, aggregation, engine), 2, engine, 20);

  it("scores each game from the player's earlier games only", () => {
    expect(games).toHaveLength(100);
    expect(games[0]!.priorGames).toBe(10); // 20 earlier games, half on this champion
  });

  it("shows the personal term helps when the player's champions really differ", () => {
    expect(score(personalPredictions(games, 1)).logLoss).toBeLessThan(score(personalPredictions(games, 0)).logLoss);
  });

  it("buckets win rate by games on the champion before", () => {
    const curve = experienceCurve(games, [0, 20, 40]);
    expect(curve.map((b) => b.games).reduce((a, b) => a + b, 0)).toBe(100);
    expect(curve[0]).toMatchObject({ from: 0, to: 20 });
    expect(curve[2]!.to).toBeNull();
  });
});
