import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { MonthlyReport } from "@ldc/engine";
import { findConfigDir, loadConfig, type LoadedConfig } from "../src/main/config";
import { monthView } from "../src/main/month-view";
import { uiCopy, viewLimits } from "../src/main/personal-coach";
import { optionText } from "../src/renderer/components/Loadout";
import { MatchupTable } from "../src/renderer/components/MatchupTable";
import { MonthReport } from "../src/renderer/components/MonthReport";
import { NewChampTable } from "../src/renderer/components/NewChampTable";
import { Stat } from "../src/renderer/components/SkillGrid";
import { isThin, rateOf, setCopy, setMinGames, winToneOf } from "../src/renderer/format";
import { FALLBACK_MIN_GAMES, type NewChampView, type RunePageView } from "../src/shared/view";

const config = loadConfig(findConfigDir(__dirname));
const MIN = config.app.display!.minGames;
const ahri = { id: 103, name: "Ahri", iconUrl: null };

beforeAll(() => {
  setCopy(uiCopy(config.explain.templates));
  setMinGames(MIN);
});

describe("the shared minimum", () => {
  it("comes from the config, with the same fallback when the config lacks it", () => {
    expect(FALLBACK_MIN_GAMES).toBe(MIN);
    expect(viewLimits(config).minGames).toBe(MIN);
    const older: LoadedConfig = { ...config, app: { ...config.app, display: undefined } };
    const bundled: LoadedConfig = { ...config, app: { ...config.app, display: { minGames: MIN + 5 } } };
    expect(viewLimits(older, bundled).minGames).toBe(MIN + 5);
    expect(viewLimits(older, older).minGames).toBe(FALLBACK_MIN_GAMES);
  });

  it("neutral and whole below it, coloured with decimals from it", () => {
    expect(isThin(MIN - 1)).toBe(true);
    expect(isThin(MIN)).toBe(false);
    expect(rateOf(0.667, MIN - 1)).toBe("67%");
    expect(rateOf(0.667, MIN)).toBe("66.7%");
    expect(winToneOf(1, MIN - 1)).toBe("flat");
    expect(winToneOf(0, MIN - 1)).toBe("flat");
    expect(winToneOf(0.6, MIN)).toBe("pos");
    expect(winToneOf(0.4, MIN)).toBe("neg");
  });
});

describe("thin samples on the panel", () => {
  const report: MonthlyReport = { from: 0, to: 1, games: 1, winRate: 1, winRateBefore: 0.5, gamesBefore: 2, role: null, axes: [], stats: [], roles: [], focus: null, champions: [{ championId: 103, games: 1, winRate: 1, change: null }], rank: { start: null, now: null, direction: null } };
  const deps = { explain: config.explain, champion: () => ahri, positionLabel: (r: string) => r, growth: null, minGames: MIN };

  it("a month of few games isn't compared with the one before", () => {
    const v = monthView(report, deps)!;
    expect(v.winRate.from).toBeNull();
    expect(v.winRate.text).toBe("win rate, too few games to compare");
    const before = monthView({ ...report, games: MIN, gamesBefore: 2 }, deps)!;
    expect(before.winRate.from).toBeNull();
    expect(before.winRate.text).not.toMatch(/up|down/);
    const enough = monthView({ ...report, games: MIN, gamesBefore: MIN, winRate: 0.6 }, deps)!;
    expect(enough.winRate).toMatchObject({ from: 0.5, text: "win rate, up 10 points" });
  });

  it("a one-game month is neither large nor green, and neither is its champion", () => {
    const html = renderToStaticMarkup(createElement(MonthReport, { month: monthView(report, deps)! }));
    expect(html).toContain("100%");
    expect(html).not.toContain("t-hero");
    expect(html).not.toContain("pos");
    const solid = renderToStaticMarkup(createElement(MonthReport, { month: monthView({ ...report, games: MIN, winRate: 0.7, champions: [{ championId: 103, games: MIN, winRate: 0.7, change: null }] }, deps)! }));
    expect(solid).toContain("t-hero");
    expect(solid).toContain("pos");
  });

  it("rune and skill win rates are coloured from 50%, and neutral below the minimum", () => {
    const html = (winRate: number, n: number) => renderToStaticMarkup(createElement(Stat, { winRate, n }));
    expect(html(0.532, 1980)).toContain('class="pos">53.2%');
    expect(html(0.47, 1980)).toContain('class="neg">47.0%');
    expect(html(1, MIN - 1)).toContain("<b>100%</b>");
  });

  it("a rune option from too few games gives its games, not a win rate", () => {
    const page = { optionLabel: "Second", share: 0.15, winRate: 0.55, games: 500 } as RunePageView;
    expect(optionText(page)).toBe("Second · 15% · 55% WR");
    expect(optionText({ ...page, games: MIN - 2 })).toBe(`Second · 15% · ${MIN - 2} games`);
    expect(optionText({ ...page, share: null, games: 1 })).toBe("Second · 1 game");
    expect(optionText({ ...page, share: null })).toBe("Second · 500 games · 55% WR");
  });

  it("a new champion from few games shows no colour, and a matchup's raw win rate no decimals", () => {
    const row = { champion: ahri, like: null, winRate: 0.8, games: 3, ease: 1, easeLabel: "Easy", owned: true, reasons: [] } as NewChampView;
    const thin = renderToStaticMarkup(createElement(NewChampTable, { rows: [row] }));
    expect(thin).toContain("80%");
    expect(thin).not.toContain("pos");
    expect(renderToStaticMarkup(createElement(NewChampTable, { rows: [{ ...row, games: MIN }] }))).toContain("c-num pos");
    const matchup = renderToStaticMarkup(createElement(MatchupTable, { rows: [{ champion: ahri, role: "middle", lane: true, winRate: 2 / 3, delta: 0, games: 3 }] }));
    expect(matchup).toContain("67% WR");
    expect(matchup).toContain("Even");
  });
});
