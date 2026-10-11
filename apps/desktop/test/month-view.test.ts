import { describe, expect, it } from "vitest";
import type { MonthlyReport } from "@ldc/engine";
import { findConfigDir, loadConfig } from "../src/main/config";
import { monthView } from "../src/main/month-view";

const config = loadConfig(findConfigDir(__dirname));
const report: MonthlyReport = {
  from: Date.UTC(2026, 8, 6),
  to: Date.UTC(2026, 9, 6),
  games: 20,
  winRate: 0.55,
  winRateBefore: 0.45,
  gamesBefore: 16,
  role: "middle",
  axes: [{ axis: "farming", from: 40, to: 47, changed: "up" }],
  stats: [],
  roles: [],
  focus: null,
  champions: [{ championId: 103, games: 12, winRate: 0.58, change: 0.08 }],
  rank: { start: { tier: "SILVER", rank: "I" }, now: { tier: "GOLD", rank: "IV" }, direction: "up" },
};
const deps = {
  explain: config.explain,
  champion: (id: number) => ({ id, name: id === 103 ? "Ahri" : `#${id}`, iconUrl: null }),
  positionLabel: (r: string) => (r === "middle" ? "Mid" : r),
  growth: null,
};

describe("month view", () => {
  it("summarises the month, with axis labels and the rank in Riot's words", () => {
    const v = monthView(report, deps)!;
    expect(v.rank).toBe("Rank: Gold IV, from Silver I");
    expect(monthView({ ...report, rank: { start: null, now: { tier: "GOLD", rank: "IV" }, direction: null } }, deps)!.rank).toBe("Rank: Gold IV");
    expect(v.axes).toEqual([{ label: "Farming", from: 40, to: 47, changed: "up" }]);
    expect(v.role).toBe("Mid");
    expect(v.steadyNote).toBe("Grey lines: no real change over 20 games.");
    expect(v.winRate).toEqual({ from: 0.45, to: 0.55, text: "win rate, up 10 points on the 30 days before" });
    expect(v.gamesBefore).toBe(16);
    expect(v.gamesBeforeText).toBe("16 games before");
  });

  it("says the win rate's direction and your roles as shares, without parsing the tiles", () => {
    const down = monthView({ ...report, winRate: 0.44, winRateBefore: 0.45, roles: [{ role: "middle", share: 0.66 }, { role: "jungle", share: 0.34 }] }, deps)!;
    expect(down.winRate.text).toBe("win rate, down 1 point on the 30 days before");
    expect(down.roles).toEqual([
      { role: "Mid", share: 0.66, text: "Mid 66%" },
      { role: "jungle", share: 0.34, text: "jungle 34%" },
    ]);
    expect(monthView({ ...report, winRateBefore: null, gamesBefore: 0 }, deps)!.winRate).toEqual({ from: null, to: 0.55, text: "win rate, with no games in the period before" });
    expect(monthView({ ...report, winRateBefore: 0.552 }, deps)!.winRate.text).toBe("win rate, the same as the 30 days before");
  });

  it("words the number trends, coloured by better or worse, and the pool focus", () => {
    const v = monthView(
      {
        ...report,
        stats: [
          { metric: "csPerMinute", lowerIsBetter: false, from: 6.21, to: 7.04, changed: "up" },
          { metric: "deathsPerMinute", lowerIsBetter: true, from: 0.2, to: 0.26, changed: "up" },
          { metric: "kda", lowerIsBetter: false, from: null, to: 2.5, changed: null },
        ],
        roles: [
          { role: "middle", share: 0.6 },
          { role: "jungle", share: 0.3 },
          { role: "top", share: 0.1 },
        ],
        focus: { n: 3, now: 0.72, before: 0.58 },
      },
      deps,
    )!;
    expect(v.stats).toEqual([
      { label: "CS/min", title: "CS per minute", from: "6.2", to: "7.0", changed: "up", tone: "pos" },
      { label: "Deaths/min", title: "Deaths per minute", from: "0.20", to: "0.26", changed: "up", tone: "neg" },
      { label: "KDA", title: "KDA", from: null, to: "2.5", changed: null, tone: null },
    ]);
    expect(v.roles.map((r) => r.text)).toEqual(["Mid 60%", "jungle 30%", "top 10%"]);
    expect(v.focusLine).toBe("Top 3: 72% of games, 58% before");
    expect(monthView({ ...report, focus: { n: 3, now: 0.5, before: null } }, deps)!.focusLine).toBe("Top 3: 50% of games");
  });

  it("has nothing to show without games in the month", () => {
    expect(monthView({ ...report, games: 0 }, deps)).toBeNull();
  });
});
