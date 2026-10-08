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
  spikes: [{ kind: "item", at: 1, minute: 11.2, gold: 120, z: 3.1, games: 400, itemId: 3031 }],
  timing: { games: 3, you: 13.42, typical: 11.1, slow: true },
};
const FIRST: LearningPlan = { ...PLAN, stage: "practice", ease: 3, settleGames: 30, record: { games: 0, wins: 0 }, focus: { ...PLAN.focus!, source: "basic", value: null, recent: [] }, good: [], hard: [], curve: null, spikes: [], timing: null };
const deps = {
  explain: config.explain,
  champion: (id: number) => (NAMES[id] ? { id, name: NAMES[id]!, iconUrl: null } : null),
  championName: (id: number) => NAMES[id] ?? `#${id}`,
  itemName: (id: number) => (id === 3031 ? "Infinity Edge" : `#${id}`),
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
      stage: "Before your first game",
      focus: { text: "Deaths before 14 min: hold your usual (1.2 or fewer) while you learn the kit", recent: [] },
      lines: [
        "Spend a few minutes in the Practice Tool on its combo and spell ranges, then play it in Normal Draft, not ranked",
        "Hard to learn: practise its combo before each game and give it Normal Draft games before ranked",
        "Its job: hit spells from range before the fight starts; stay behind your frontline",
        "Mid: learn its trading pattern (short trades or all-in) and when it can leave lane to help",
        "Play it in blocks of 2 to 3 games; players keep improving on a new champion for about 30 games, so don't judge it before",
      ],
    });
    expect(v.learning).toBeNull();
  });

  it("while you're learning one: the stage, what dropped on it, its job, matchups, power curve and your record; the picks are for after it", () => {
    const v = newChampsView({ role: "middle", picks: [pick(245)], learning: { championId: 99, progress: { games: 3, maxGames: 7, daysLeft: 12 } } }, deps);
    expect(v.learning).toMatchObject({
      title: "Learning Lux",
      progress: "3 of 7 games · 12 days left",
      learn: {
        stage: "Building up",
        focus: { text: "Deaths before 14 min: 2.5 on it, 1.2 on your other mid champions. Get back to 1.2 or fewer", recent: [false, true, false] },
        lines: [
          "One thing per game, then look back at that game before the next",
          "Its job: hit spells from range before the fight starts; stay behind your frontline",
          "Mid: learn its trading pattern (short trades or all-in) and when it can leave lane to help",
          "Its spike: Infinity Edge (item 1, ~11 min). Fight once it's done; farm safely before",
          "Your first item on it: 13.4 min (3 games), typical 11.1 min: farm and back on time to reach it sooner",
          "Wins more of long games (53% vs 47% in short ones): farm safely and fight later",
          "Easier first games into Orianna (+3.1%)",
          "Avoid or ban while learning: Zed (−4.2%), LeBlanc (−2.0%)",
          "Play it in blocks of 2 to 3 games; players keep improving on a new champion for about 15 games, so don't judge it before",
          "Your games on it: 2 won, 1 lost",
        ],
      },
      after: "After Lux",
      why: "one new champion per role at a time",
    });
    expect(v.picks.map((p) => p.champion.name)).toEqual(["Ekko"]);
    expect(v.plan).toBeNull();
    expect(v.planLearn).toBeNull();
  });

  it("says 1 day left, and caps the games at the learning limit", () => {
    const v = newChampsView({ role: "middle", picks: [], learning: { championId: 7, progress: { games: 9, maxGames: 7, daysLeft: 1 } } }, deps);
    expect(v.learning).toMatchObject({ progress: "7 of 7 games · 1 day left", learn: { stage: "", focus: null, lines: [] } });
  });
});
