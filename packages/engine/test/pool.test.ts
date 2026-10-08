import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { analyzePool, computeComfort, parseEngineConfig, playerGame, type ChampionAttributes, type MasteryEntry, type PlayerGame } from "../src/index";

const cfg = parseEngineConfig(JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "config", "engine.v1.json"), "utf8")));
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const MAIN = 1; // physical jungler, 20 games
const SECOND = 2; // physical, 6 games, older
const NEW = 3; // first played 5 days ago
const OLD = 4; // lots of mastery, unplayed for 120 days

const attr = (id: number, a: Partial<ChampionAttributes>): ChampionAttributes => ({
  championId: id, samples: 30, physicalShare: 0.9, magicShare: 0.08, trueShare: 0.02, frontline: 0.3, engage: 0.3, roleShares: {}, roleSamples: 0, ...a,
});
const attributes = new Map<number, ChampionAttributes>([
  [MAIN, attr(MAIN, {})],
  [SECOND, attr(SECOND, {})],
  [NEW, attr(NEW, {})],
  [OLD, attr(OLD, { physicalShare: 0.1, magicShare: 0.85 })],
  [50, attr(50, { frontline: 0.9, engage: 0.9 })], // an ally tank
  [51, attr(51, {})],
]);

const part = (championId: number, teamId: number, win: boolean, position = "", magic = 1000): ParticipantSummary => ({
  championId, teamId, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 10_000, magicDamage: magic, trueDamage: 0, damageTaken: 0, selfMitigated: 0, ccSeconds: 0,
  objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {},
});

/** A jungle game on `champ`; the team is all physical; with `tank` an ally frontliner is present. */
function game(i: number, champ: number, win: boolean, ageDays: number, tank = false): UserMatch {
  return {
    me: 0,
    match: {
      matchId: `EUW1_${i}`, queueId: 420, gameVersion: "x", endedAt: NOW - ageDays * DAY, durationSec: 1800,
      participants: [part(champ, 100, win, "jungle"), part(tank ? 50 : 51, 100, win), part(51, 200, !win, "jungle", 9000)],
    },
  };
}

const matches: UserMatch[] = [
  ...Array.from({ length: 20 }, (_, i) => game(i, MAIN, i % 2 === 0, 1 + i, i % 3 === 0)),
  ...Array.from({ length: 6 }, (_, i) => game(100 + i, SECOND, i < 4, 40 + i)),
  ...Array.from({ length: 2 }, (_, i) => game(200 + i, NEW, true, 5 - i)),
];
const masteries: MasteryEntry[] = [
  { championId: MAIN, level: 20, points: 300_000, lastPlayTime: NOW - DAY },
  { championId: OLD, level: 10, points: 90_000, lastPlayTime: NOW - 120 * DAY },
];
const games = matches.map(playerGame).filter((g): g is PlayerGame => g !== null);
const intended = new Map<number, string[]>([[MAIN, ["jungle"]], [SECOND, ["jungle"]], [NEW, ["jungle"]], [OLD, ["jungle"]]]);

const analyze = (over: Partial<Parameters<typeof analyzePool>[0]> = {}) =>
  analyzePool({
    role: "jungle",
    comfort: computeComfort(games, masteries, NOW, cfg.comfort, "jungle"),
    masteries,
    matches,
    attributes,
    intendedPositions: intended,
    now: NOW,
    config: cfg,
    ...over,
  });

describe("champion pool", () => {
  it("sorts champions into main, comfortable, learning and rusty", () => {
    const pool = analyze();
    const tierOf = (id: number) => pool.champions.find((c) => c.championId === id)?.tier;
    expect(tierOf(MAIN)).toBe("main");
    expect(tierOf(SECOND)).toBe("comfortable");
    expect(tierOf(NEW)).toBe("learning");
    // First played 5 days ago, 2 games: the rest of the window and the game limit from config.
    expect(pool.champions.find((c) => c.championId === NEW)?.progress).toEqual({
      games: 2,
      maxGames: cfg.pool.learningMaxGames,
      daysLeft: cfg.pool.learningWindowDays - 5,
    });
    expect(pool.champions.find((c) => c.championId === MAIN)?.progress).toBeUndefined();
    expect(tierOf(OLD)).toBe("rusty");
    expect(pool.champions.map((c) => c.tier)).toEqual(["main", "comfortable", "learning", "rusty"]);
    expect(pool.champions[0]).toMatchObject({ games: 20, winRate: 0.5 });
  });

  it("finds a missing magic damage pick, backed by the losses where the team lacked it", () => {
    const pool = analyze();
    const magic = pool.holes.find((h) => h.need === "magic")!;
    // OLD (rusty) is a mage: it would cover the hole.
    expect(magic).toEqual({ need: "magic", coveredBy: [OLD], lossesLacking: 12, losses: 12 });
    expect(pool.holes[0]?.need).toBe("magic"); // most frequent first
  });

  it("drops a hole the player's losses don't back up", () => {
    // Magic was lacking in every loss; frontline and engage only in losses without the ally tank (about two thirds).
    expect(analyze().holes.map((h) => h.need)).toEqual(["magic", "frontline", "engage"]);
    const strict = analyze({ config: { ...cfg, pool: { ...cfg.pool, minLossShare: 0.9 } } });
    expect(strict.holes.map((h) => h.need)).toEqual(["magic"]);
  });

  it("doesn't count the rusty or learning champions as covering a need", () => {
    // OLD is a mage but rusty: magic is still a hole.
    expect(analyze().holes.some((h) => h.need === "magic")).toBe(true);
  });

  it("skips a need the role rarely fills in your rank (a bot lane without magic damage is normal)", () => {
    // OLD is the only mage: when mages play 5% of the role's games, no magic hole; at 50%, there is one.
    const rare = analyze({ rolePicks: [{ championId: OLD, games: 5 }, { championId: MAIN, games: 95 }] });
    expect(rare.holes.some((h) => h.need === "magic")).toBe(false);
    const common = analyze({ rolePicks: [{ championId: OLD, games: 50 }, { championId: MAIN, games: 50 }] });
    expect(common.holes.some((h) => h.need === "magic")).toBe(true);
  });

  it("judges nothing without measured attributes", () => {
    expect(analyze({ attributes: new Map() }).holes).toEqual([]);
  });
});
