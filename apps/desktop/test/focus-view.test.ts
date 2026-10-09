import { describe, expect, it } from "vitest";
import type { GrowthFocus } from "@ldc/engine";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { focusInGame, focusView } from "../src/main/focus-view";

const config = loadConfig(findConfigDir(__dirname));
const growth: GrowthFocus = {
  role: "middle",
  championId: 103,
  reference: "band",
  scope: "role",
  games: 20,
  focus: { metric: "csPerMinute", lowerIsBetter: false, you: 6.1, baseline: 6, target: 6.8, typical: 7.6, importance: 0.083, importanceFrom: "band", impact: 0.4, recent: [true, false, false], done: false },
  met: [{ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.31, baseline: 0.42, target: 0.36, typical: 0.3, importance: -0.1, importanceFrom: "band", impact: 0.2, recent: [true], done: true }],
};
const deps = {
  explain: config.explain,
  targetStep: 0.5,
  checkGames: 10,
  bandName: "Gold to Platinum",
  championName: (id: number) => (id === 103 ? "Ahri" : `#${id}`),
  positionLabel: (r: string) => (r === "middle" ? "Mid" : r),
};

describe("focus view", () => {
  it("formats the focus with its numbers and why it was chosen, from config wording", () => {
    const v = focusView(growth, deps)!;
    expect(v).toMatchObject({ label: "CS per minute", title: "More CS per minute", goalText: "6.8 or more", goalHint: expect.stringMatching(/^Your next step: \d+% of the way to the average$/), on: "Ahri · Mid", youText: "6.1", targetText: "6.8", typicalText: "7.6", recent: [true, false, false] });
    expect(v.why).toBe("Why this: in Gold to Platinum, mid players on the better half here win 8 points more of their games than the other half.");
    expect(v.met).toEqual(["Deaths per minute: 0.42 → 0.31, goal met"]);
    expect(v.tips).toEqual(config.explain.tips["middle:csPerMinute"] ?? []);
    const support = focusView({ ...growth, role: "utility", focus: { ...growth.focus!, metric: "challenges.controlWardsPlaced" } }, deps)!;
    expect(support.tips.length).toBeGreaterThan(0);
    expect(focusView({ ...growth, role: "utility", championId: null, scope: "few", games: 1 }, { ...deps, positionLabel: () => "Support" })!.on).toBe("Support · from your 1 game so far");
    expect(focusView({ ...growth, focus: null }, deps)).toBeNull();
  });

  it("reads the focus metric in one of your games for the post-game card", () => {
    const me = { championId: 103, position: "middle", win: true, cs: 210, deaths: 2, challenges: {} } as unknown as ParticipantSummary;
    const m: UserMatch = { match: { matchId: "EUW1_5", queueId: 420, gameVersion: "16.19", endedAt: 1, durationSec: 1800, participants: [me] }, me: 0 };
    expect(focusInGame(growth, "EUW1_5", [m], config.explain)).toEqual({ label: "CS per minute", value: "7.0", target: "6.8", met: true });
    expect(focusInGame(growth, "EUW1_6", [m], config.explain)).toBeNull();
  });

  it("says nothing about the goal for a game in another role or on another champion", () => {
    const game = (championId: number, position: string): UserMatch => ({ match: { matchId: "EUW1_7", queueId: 420, gameVersion: "16.19", endedAt: 1, durationSec: 1800, participants: [{ championId, position, win: true, cs: 210, deaths: 2, challenges: {} } as unknown as ParticipantSummary] }, me: 0 });
    expect(focusInGame(growth, "EUW1_7", [game(103, "utility")], config.explain)).toBeNull();
    expect(focusInGame(growth, "EUW1_7", [game(99, "middle")], config.explain)).toBeNull();
    expect(focusInGame({ ...growth, championId: null }, "EUW1_7", [game(99, "middle")], config.explain)).not.toBeNull();
  });

  it("shows one game's count as a whole number, and averages with a decimal", () => {
    const deaths: GrowthFocus = { ...growth, focus: { ...growth.focus!, metric: "challenges.deathsByEnemyChamps", lowerIsBetter: true, target: 8 } };
    const me = { championId: 103, position: "middle", win: true, challenges: { deathsByEnemyChamps: 8 } } as unknown as ParticipantSummary;
    const m: UserMatch = { match: { matchId: "EUW1_5", queueId: 420, gameVersion: "16.19", endedAt: 1, durationSec: 1800, participants: [me] }, me: 0 };
    expect(focusInGame(deaths, "EUW1_5", [m], config.explain)).toMatchObject({ value: "8", target: "8.0", met: true });
  });

  it("says the why from where the importance was measured, even when typical comes from your rank", () => {
    const fromGames = { ...growth, focus: { ...growth.focus!, importanceFrom: "games" as const } };
    expect(focusView(fromGames, deps)!.why).toMatch(/^Why this: in your games, mid players/);
    expect(focusView(fromGames, deps)!.typicalLine).toBe("Typical mid player in your rank: 7.6");
  });

  it("names the average by where it came from: your rank, or your own games when the rank's data is thin", () => {
    expect(focusView(growth, deps)!.typicalLine).toBe("Typical mid player in your rank: 7.6");
    expect(focusView({ ...growth, reference: "games" }, deps)!.typicalLine).toBe("Typical mid player in your games: 7.6");
  });
});
