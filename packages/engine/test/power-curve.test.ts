import { describe, expect, it } from "vitest";
import { curveGap } from "../src/index";

const pc = (early: number, late: number, earlyGames: number, lateGames = earlyGames) => ({ early: { games: earlyGames, winRate: early }, late: { games: lateGames, winRate: late } });

describe("curveGap", () => {
  it("reports a gap only beyond chance: enough games, big enough, and enough standard errors", () => {
    expect(curveGap(pc(0.267, 0.576, 116, 170), 30, 0.03, 2)).toBeCloseTo(0.309); // Kayle on production data
    expect(curveGap(pc(0.532, 0.476, 111, 225), 30, 0.03, 2)).toBeNull(); // Lillia: −5.6 points is within ~±6
    expect(curveGap(pc(0.47, 0.55, 400), 30, 0.03, 2)).toBeCloseTo(0.08);
    expect(curveGap(pc(0.47, 0.55, 100), 30, 0.03, 2)).toBeNull();
    expect(curveGap(pc(0.5, 0.52, 5000), 30, 0.03, 2)).toBeNull(); // real but small
    expect(curveGap(pc(0.3, 0.7, 20), 30, 0.03, 2)).toBeNull(); // too few games
    expect(curveGap(undefined, 30, 0.03, 2)).toBeNull();
  });
});
