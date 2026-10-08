import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChampionInfo, MetaSnapshot } from "@ldc/shared";
import { learningPlan, MetaIndex, parseEngineConfig, parseExplainConfig, recommendNewChampions, renderReason, type NewChampInput, type RolePool } from "../src/index";

const read = (n: string) => JSON.parse(readFileSync(new URL(`../../../config/${n}`, import.meta.url), "utf8"));
const config = parseEngineConfig(read("engine.v1.json"));
const explain = parseExplainConfig(read("explain.v1.json"));
const NAMES: Record<number, string> = { 1: "Mage", 2: "Assassin", 3: "Tank", 4: "Battlemage", 5: "Clone" };
const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, explain.templates, (id) => NAMES[id] ?? `#${id}`);

// Mid champions: 1 is your main (a mage). 4 is another mage, 5 a near-copy of 1, 2 an assassin, 3 a tank.
const info: Record<number, Pick<ChampionInfo, "info" | "tags">> = {
  1: { info: { attack: 2, defense: 3, magic: 9, difficulty: 5 }, tags: ["Mage"] },
  2: { info: { attack: 8, defense: 3, magic: 2, difficulty: 8 }, tags: ["Assassin"] },
  3: { info: { attack: 4, defense: 9, magic: 4, difficulty: 2 }, tags: ["Tank"] },
  4: { info: { attack: 3, defense: 4, magic: 8, difficulty: 3 }, tags: ["Mage", "Support"] },
  5: { info: { attack: 2, defense: 3, magic: 9, difficulty: 5 }, tags: ["Mage"] },
};
const stat = (championId: number, games: number, wr: number) => ({ championId, role: "middle", games, wins: games * wr, n: games });
const snapshot: MetaSnapshot = {
  format: 1, band: 2, createdAt: 0, patch: null, matches: 10_000, newestMatchAt: 0, halfLifeDays: 10,
  roleGames: { middle: 20_000 },
  champions: [stat(1, 2000, 0.5), stat(2, 2000, 0.5), stat(3, 800, 0.5), stat(4, 1500, 0.54), stat(5, 1500, 0.5), stat(6, 50, 0.6)],
  matchups: [], duos: [], attributes: [], references: {},
};
const pool = (over: Partial<RolePool> = {}): RolePool => ({ role: "middle", champions: [{ championId: 1, tier: "main", games: 40, winRate: 0.55, comfort: 0.8 }], holes: [], ...over });
const input = (over: Partial<NewChampInput> = {}): NewChampInput => ({
  role: "middle",
  pool: pool(),
  playedInRole: new Map([[1, 40]]),
  masteries: [],
  index: new MetaIndex(snapshot, config.rating),
  champions: (id) => info[id],
  attributes: new Map(),
  owned: new Set([1, 2, 3, 5]),
  config: config.newChamps,
  coverage: config.pool.coverage,
  ...over,
});

describe("recommendNewChampions", () => {
  it("suggests meta champions that play like your main, strong ones first, never a clone or your own pool", () => {
    const r = recommendNewChampions(input());
    const ids = r.picks.map((p) => p.championId);
    expect(ids[0]).toBe(4); // a mage like yours, strong in your rank, easy
    expect(ids).not.toContain(1); // already yours
    expect(ids).not.toContain(6); // too few games to be meta
    expect(r.picks.find((p) => p.championId === 5)?.parts.overlap ?? 1).toBeGreaterThan(0); // a clone is penalised
    const top = r.picks[0]!;
    expect(top).toMatchObject({ like: 1, ease: 1, owned: false });
    expect(top.reasons.map(say)).toEqual(["Plays like your Mage", "Strong in your rank: 53.6% win rate (1,500 games)", "Easy to pick up", "You don't own it yet"]);
  });

  it("adds champions that fill a pool gap", () => {
    const attributes = new Map([[3, { championId: 3, samples: 100, physicalShare: 0.5, magicShare: 0.5, trueShare: 0, frontline: 0.9, engage: 0.9, roleShares: {}, roleSamples: 100 }]]);
    const r = recommendNewChampions(input({ attributes, pool: pool({ holes: [{ need: "frontline", coveredBy: [], lossesLacking: 4, losses: 9 }] }) }));
    const tank = r.picks.find((p) => p.championId === 3)!;
    expect(tank.covers).toEqual(["frontline"]);
    expect(tank.reasons.map(say)).toContain("Adds the frontline your mid pool lacks");
  });

  it("while you're learning a champion in the role: reports it and suggests the next ones without it", () => {
    const progress = { games: 2, maxGames: 7, daysLeft: 12 };
    const r = recommendNewChampions(input({ pool: pool({ champions: [...pool().champions, { championId: 2, tier: "learning", games: 2, winRate: null, comfort: 0.2, progress }] }) }));
    expect(r.learning).toEqual({ championId: 2, progress });
    expect(r.picks.length).toBeGreaterThan(0);
    expect(r.picks.map((p) => p.championId)).not.toContain(2);
  });
});

describe("learningPlan", () => {
  let t = 0;
  const game = (championId: number, position: string, win: boolean, earlyDeaths: number) => ({
    match: { matchId: `M${++t}`, queueId: 420, gameVersion: "16.19", endedAt: t, durationSec: 1800, participants: [{ championId, position, win, deaths: earlyDeaths, earlyDeaths, challenges: {} }] },
    me: 0,
  });
  // Your usual mid games on your main (1): early deaths 1 and 2, alternating (mean 1.5, spread 0.5).
  const usual = Array.from({ length: 6 }, (_, i) => game(1, "middle", true, 1 + (i % 2)));
  const pair = (b: number, games: number, winsOfA: number) => [4, "middle", b, "middle", games, winsOfA, games] as [number, string, number, string, number, number, number];
  const snap: MetaSnapshot = {
    ...snapshot,
    matchups: [pair(1, 1000, 600), pair(2, 1000, 380), pair(3, 1000, 540), pair(5, 10, 9), [4, "middle", 6, "top", 1000, 900, 1000]],
    attributes: [{ championId: 4, samples: 500, physicalShare: 0.2, magicShare: 0.8, trueShare: 0, frontline: 0.3, engage: 0.4, roleShares: {}, roleSamples: 500, powerCurve: { early: { games: 800, winRate: 0.46 }, late: { games: 800, winRate: 0.55 } } }],
  };
  const plan = (over: Partial<Parameters<typeof learningPlan>[0]> = {}) =>
    learningPlan({
      championId: 4,
      role: "middle",
      matches: [...usual, game(4, "middle", true, 3), game(4, "middle", false, 4), game(4, "middle", false, 2), game(4, "jungle", true, 0)] as never,
      index: new MetaIndex(snap, config.rating),
      champion: info[4],
      goal: null,
      config,
      ...over,
    });

  it("says how it wins in your rank: the role's goal metrics that differ most between its wins and losses, with your numbers", () => {
    const roles = { ...config.growth.roles, middle: ["-earlyDeaths", "challenges.laneMinionsFirst10Minutes", "challenges.turretPlatesTaken"] };
    const withWins: MetaSnapshot = {
      ...snap,
      references: { middle: { earlyDeaths: { n: 500, quantiles: [0, 1, 1, 2, 5] }, "challenges.laneMinionsFirst10Minutes": { n: 500, quantiles: [40, 55, 62, 70, 90] }, "challenges.turretPlatesTaken": { n: 500, quantiles: [0, 0, 1, 2, 5] } } },
      championWins: [{ championId: 4, role: "middle", n: 900, metrics: { earlyDeaths: [1.1, 2.1, 900], "challenges.laneMinionsFirst10Minutes": [66, 64, 900], "challenges.turretPlatesTaken": [0.9, 1.2, 900] } }],
    };
    const p = plan({ index: new MetaIndex(withWins, config.rating), config: { ...config, growth: { ...config.growth, roles } } });
    // Deaths differ by a full spread, CS by 2/15 of one; plates go the wrong way (more in losses): left out.
    expect(p.wins.map((w) => w.metric)).toEqual(["earlyDeaths", "challenges.laneMinionsFirst10Minutes"]);
    expect(p.wins[0]).toMatchObject({ winners: 1.1, losers: 2.1, you: 3 });
    expect(plan().wins).toEqual([]); // no measurements in the snapshot
  });

  it("gives the stage, its job, ease, how long to give it, your record, and the matchups to start into and avoid", () => {
    const p = plan();
    expect(p).toMatchObject({ stage: "building", ease: 1, settleGames: config.newChamps.learn.settleGames.easy, job: "Mage", record: { games: 3, wins: 1 } });
    expect(p.good.map((o) => o.championId)).toEqual([1]); // 3 is near even, 5 too few games, 6 another role
    expect(p.hard.map((o) => o.championId)).toEqual([2]);
    expect(p.curve).toMatchObject({ late: true });
  });

  it("makes the focus what dropped on it against your other champions in the role, held at your usual", () => {
    const f = plan().focus!;
    expect(f).toMatchObject({ metric: "earlyDeaths", lowerIsBetter: true, source: "drop", value: 3, usual: 1.5, target: 1.5 });
    expect(f.recent).toEqual([false, false, false]);
  });

  it("without a drop, uses your growth goal in the role, else the role's basic at your usual", () => {
    const even = [...usual, game(4, "middle", true, 1), game(4, "middle", true, 2)] as never;
    const goal = { role: "middle", metric: "challenges.visionScorePerMinute", lowerIsBetter: false, target: 1.2 };
    expect(plan({ matches: even, goal }).focus).toMatchObject({ source: "goal", metric: "challenges.visionScorePerMinute", target: 1.2, value: null });
    expect(plan({ matches: even, goal: { ...goal, role: "jungle" } }).focus).toMatchObject({ source: "basic", metric: "earlyDeaths", target: 1.5, value: 1.5, recent: [true, false] });
  });

  it("before the first game: the practice stage, the role's basic as the focus; nothing measured without your usual or meta", () => {
    expect(plan({ matches: usual as never })).toMatchObject({ stage: "practice", record: { games: 0, wins: 0 }, focus: { source: "basic", value: null, target: 1.5, recent: [] } });
    expect(plan({ matches: [game(4, "middle", true, 1)] as never, index: null, champion: undefined })).toMatchObject({
      stage: "first",
      ease: null,
      job: null,
      focus: null,
      good: [],
      hard: [],
      curve: null,
    });
  });
});
