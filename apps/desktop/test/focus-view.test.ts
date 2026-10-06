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
  focus: { metric: "csPerMinute", lowerIsBetter: false, you: 6.1, baseline: 6, target: 6.8, typical: 7.6, importance: 0.083, impact: 0.4, recent: [true, false, false], done: false },
  met: [{ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.31, baseline: 0.42, target: 0.36, typical: 0.3, importance: -0.1, impact: 0.2, recent: [true], done: true }],
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
    expect(v).toMatchObject({ label: "CS per minute", title: "More CS per minute", goalText: "6.8 or more", on: "Ahri · Mid", youText: "6.1", targetText: "6.8", typicalText: "7.6", recent: [true, false, false] });
    expect(v.why).toBe("Why this: in Gold to Platinum, mid players who beat the average here win more (win rate +8 points).");
    expect(v.met).toEqual(["Deaths per minute: 0.4 → 0.3, target met"]);
    expect(focusView({ ...growth, focus: null }, deps)).toBeNull();
  });

  it("reads the focus metric in one of your games for the post-game card", () => {
    const me = { championId: 103, position: "middle", win: true, cs: 210, deaths: 2, challenges: {} } as unknown as ParticipantSummary;
    const m: UserMatch = { match: { matchId: "EUW1_5", queueId: 420, gameVersion: "16.19", endedAt: 1, durationSec: 1800, participants: [me] }, me: 0 };
    expect(focusInGame(growth, "EUW1_5", [m], config.explain)).toEqual({ label: "CS per minute", value: "7.0", target: "6.8", met: true });
    expect(focusInGame(growth, "EUW1_6", [m], config.explain)).toBeNull();
  });
});
