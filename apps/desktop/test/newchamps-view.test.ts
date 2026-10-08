import { describe, expect, it } from "vitest";
import type { LearningPlan, NewChampAdvice, NewChampion } from "@ldc/engine";
import { findConfigDir, loadConfig } from "../src/main/config";
import { newChampsView } from "../src/main/newchamps-view";

const config = loadConfig(findConfigDir(__dirname));
const NAMES: Record<number, string> = { 99: "Lux", 103: "Ahri", 245: "Ekko", 7: "LeBlanc", 61: "Orianna", 238: "Zed" };
const PLAN: LearningPlan = {
  stage: "building",
  ease: 1,
  settleGames: 15,
  record: { games: 3, wins: 2 },
  focus: { metric: "earlyDeaths", lowerIsBetter: true, source: "drop", value: 2.5, usual: 1.2, target: 1.2, recent: [false, true, false] },
  job: "Mage",
  good: [{ championId: 61, deltaWin: 0.031, games: 400 }],
  hard: [
    { championId: 238, deltaWin: -0.042, games: 500 },
    { championId: 7, deltaWin: -0.02, games: 300 },
  ],
  curve: { late: true, early: 0.47, lateRate: 0.53 },
  wins: [
    { metric: "earlyDeaths", lowerIsBetter: true, winners: 1.1, losers: 2.05, games: 900, you: 2.5 },
    { metric: "challenges.laneMinionsFirst10Minutes", lowerIsBetter: false, winners: 68.4, losers: 61.2, games: 900, you: null },
  ],
  profile: null,
  skills: { first: [3, 1, 2], order: [1, 3, 2], share: 0.55 },
  laneGold: null,
  evenMatchups: null,
  evenCurve: null,
};
const FIRST: LearningPlan = { ...PLAN, stage: "practice", ease: 3, settleGames: 30, record: { games: 0, wins: 0 }, focus: { ...PLAN.focus!, source: "basic", value: null, recent: [] }, good: [], hard: [], curve: null, wins: [], skills: null };
const deps = {
  explain: config.explain,
  champion: (id: number) => (NAMES[id] ? { id, name: NAMES[id]!, iconUrl: null } : null),
  championName: (id: number) => NAMES[id] ?? `#${id}`,
  planGames: [3, 5] as [number, number],
  blockGames: [2, 3] as [number, number],
  plan: (id: number): LearningPlan | null => (id === 99 ? PLAN : id === 245 ? FIRST : null),
};
const pick = (championId: number, over: Partial<NewChampion> = {}): NewChampion => ({
  championId,
  fit: 1,
  parts: { similarity: 0.6, gap: 0, meta: 0.5, ease: 0.7, overlap: 0 },
  like: 103,
  winRate: 0.524,
  games: 1800,
  ease: 1,
  owned: false,
  covers: [],
  reasons: [
    { id: "newchamp.like", slots: { like: 103 } },
    { id: "newchamp.notOwned", slots: {} },
  ],
  ...over,
});

describe("new champions view", () => {
  it("shows each pick with its numbers and, for the top one, how to start learning it", () => {
    const a: NewChampAdvice = { role: "middle", picks: [pick(245, { ease: 3, owned: true, like: null }), pick(99)], learning: null };
    const v = newChampsView(a, deps);
    expect(v.picks.map((p) => [p.champion.name, p.like?.name ?? null, p.easeLabel, p.owned])).toEqual([["Ekko", null, "Hard", true], ["Lux", "Ahri", "Easy", false]]);
    expect(v.picks[1]!.reasons).toEqual(["You don't own it yet"]);
    expect(v.plan).toBe("Try Ekko in 3 to 5 Normal Draft games.");
    expect(v.planLearn).toEqual({
      stage: "First game on it",
      focus: { text: "Keep your deaths before 14 min at 1.2 or fewer, your usual", recent: [] },
      lines: [], // no generic advice: only what the data says about the champion
    });
    expect(v.learning).toBeNull();
  });

  it("while you're learning one: the stage, what dropped on it, how it wins in your rank, power curve, matchups and your record; the picks are for after it", () => {
    const v = newChampsView({ role: "middle", picks: [pick(245)], learning: { championId: 99, progress: { games: 3, maxGames: 7, daysLeft: 12 } } }, deps);
    expect(v.learning).toMatchObject({
      title: "Learning Lux",
      progress: "3 of 7 games · 12 days left",
      learn: {
        stage: "Getting comfortable",
        focus: { text: "On it: deaths before 14 min 2.5, vs 1.2 on your other mid picks", recent: [false, true, false] },
        lines: [
          "Skills: start E, Q, W; max Q, then E, then W (55% of players)",
          "It wins with fewer deaths before 14 min: 1.1 in wins, 2.0 in losses (you: 2.5); and more CS at 10 min: 68 in wins, 61 in losses",
          "Stronger in long games: wins 53%, vs 47% in short ones",
          "Good first matchups: Orianna (+3.1%)",
          "Tough matchups for now: Zed (−4.2%), LeBlanc (−2.0%)",
          "You on it: 2–1",
        ],
      },
      after: "After Lux",
      why: "one new champion per role at a time",
    });
    expect(v.picks.map((p) => p.champion.name)).toEqual(["Ekko"]);
    expect(v.plan).toBeNull();
    expect(v.planLearn).toBeNull();
  });

  it("says how it plays, and says so when nothing swings it (matchups, short vs long games, gold at 15)", () => {
    const flat: LearningPlan = {
      ...PLAN,
      wins: [],
      skills: null,
      curve: null,
      good: [],
      hard: [],
      record: { games: 0, wins: 0 },
      profile: { physical: 0.78, magic: 0.14, frontline: 0.69, engage: 0.2 },
      laneGold: { diff: -64, games: 540 },
      evenMatchups: 23,
      evenCurve: { early: 0.531, late: 0.545 },
    };
    const v = newChampsView({ role: "jungle", picks: [], learning: { championId: 99, progress: null } }, { ...deps, plan: () => flat, learn: { profile: { high: 0.66, low: 0.33 }, laneGoldEven: 300 } });
    expect(v.learning?.learn?.lines).toEqual([
      "Plays as: mostly physical damage, tankier than most, little crowd control",
      "As strong in short games as in long ones: 53% and 55%",
      "No jungle matchup swings it much in your rank (23 measured): a safe blind pick",
      "Usually even in gold with its jungle opponent at 15 min",
    ]);
  });

  it("says 1 day left, and caps the games at the learning limit", () => {
    const v = newChampsView({ role: "middle", picks: [], learning: { championId: 7, progress: { games: 9, maxGames: 7, daysLeft: 1 } } }, deps);
    expect(v.learning).toMatchObject({ progress: "7 of 7 games · 1 day left", learn: { stage: "", focus: null, lines: [] } });
  });
});
