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
  it("summarises the month in tiles, with axis labels and the rank in Riot's words", () => {
    const v = monthView(report, deps)!;
    expect(v.strip).toEqual([
      { label: "Games", value: "20", sub: "mostly mid" },
      { label: "Win rate", value: "55%", sub: "+10.0 vs before", tone: "pos" },
      { label: "Rank", value: "Gold IV", sub: "from Silver I", tone: "pos" },
      { label: "Goals met", value: "0" },
    ]);
    expect(v.axes).toEqual([{ label: "Farming", from: 40, to: 47, changed: "up" }]);
    expect(v.role).toBe("Mid");
    expect(v.footer).toBe("Trends over 20 games, not single games.");
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
    expect(v.strip[0]).toEqual({ label: "Games", value: "20", sub: "mid 60% · jungle 30%" });
    expect(v.focusLine).toBe("Top 3: 72% of games, 58% before");
    expect(monthView({ ...report, focus: { n: 3, now: 0.5, before: null } }, deps)!.focusLine).toBe("Top 3: 50% of games");
  });

  it("has nothing to show without games in the month", () => {
    expect(monthView({ ...report, games: 0 }, deps)).toBeNull();
  });
});
