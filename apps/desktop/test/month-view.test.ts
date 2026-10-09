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

  it("has nothing to show without games in the month", () => {
    expect(monthView({ ...report, games: 0 }, deps)).toBeNull();
  });
});
