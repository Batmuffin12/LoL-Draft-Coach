import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { renderReason } from "@ldc/engine";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { Stat } from "../src/renderer/components/SkillGrid";
import { MatchupTable } from "../src/renderer/components/MatchupTable";
import { NewChampTable } from "../src/renderer/components/NewChampTable";
import { count, gameCount, setCopy, t } from "../src/renderer/format";
import { LoadoutFooter } from "../src/renderer/screens/LockedInScreen";
import type { MyPickView, NewChampView } from "../src/shared/view";

const { templates } = loadConfig(findConfigDir(__dirname)).explain;
const ahri = { id: 103, name: "Ahri", iconUrl: null };
const say = (id: string, slots: Record<string, string | number>) => renderReason({ id, slots }, templates, () => "Ahri");

beforeAll(() => setCopy(uiCopy(templates)));

describe("plural forms", () => {
  it("no template puts a number before a fixed 'games'", () => {
    const fixed = Object.entries(templates).filter(([, v]) => /\{(?!role\}|per\})[^}|]+\}(?: recent| \{[^}|]+\})* games\b/.test(v));
    expect(fixed.map(([k]) => k)).toEqual([]);
  });

  it("the month's note and the reasons say 1 game", () => {
    expect(say("month.realChanges", { games: 1 })).toBe("Real changes over 1 game");
    expect(say("month.realChanges", { games: 20 })).toBe("Real changes over 20 games");
    expect(say("meta.strong", { role: "middle", winRate: 0.5, games: 1 })).toContain("(1 game)");
  });

  it("wins per 100 follow the number shown", () => {
    expect(say("lane.good", { enemy: 1, delta: 0.012, games: 40 })).toContain("1 more win per 100 games");
    expect(say("lane.good", { enemy: 1, delta: 0.031, games: 40 })).toContain("3 more wins per 100 games");
    expect(say("lane.bad", { enemy: 1, delta: -0.004, games: 40 })).toContain("1 fewer win per 100 games");
  });

  it("a formatted count keeps the raw number for the word", () => {
    expect(gameCount(1)).toBe("1 game");
    expect(gameCount(2)).toBe("2 games");
    expect(gameCount(1240)).toBe("1,240 games");
    expect(t("loadout.source", { games: count(1), n: 1, source: "Gold" })).toBe("From 1 game in Gold");
    expect(t("loadout.source", { games: count(2140), n: 2140, source: "Gold" })).toBe("From 2,140 games in Gold");
    expect(t("matchups.source", { games: count(1), n: 1 })).toBe("Matchups from 1 recent ranked game in your rank.");
  });

  it("what an installed older app sends still reads: it has no raw number, so the plural stays", () => {
    expect(t("loadout.source", { games: "2,140", source: "Gold" })).toBe("From 2,140 games in Gold");
  });

  it("the loadout's source line and the small tables say 1 game", () => {
    const pick = { champion: ahri, importLines: [], loadout: { games: 1, source: "Gold", thinNote: null, canImport: false, page: null, pageAlt: null, spells: null, items: [], commonPath: null, starting: null } } as unknown as MyPickView;
    expect(renderToStaticMarkup(createElement(LoadoutFooter, { pick, runes: { key: null, choose: () => {} } }))).toContain("From 1 game in Gold");
    expect(renderToStaticMarkup(createElement(Stat, { winRate: null, n: 1 }))).toContain("1 game<");
    expect(renderToStaticMarkup(createElement(Stat, { winRate: 0.5, n: 1 }))).toContain("WR · 1 game");
    const row = { champion: ahri, like: null, winRate: 0.5, games: 1, ease: 1, easeLabel: "Easy", owned: true, reasons: [] } as NewChampView;
    expect(renderToStaticMarkup(createElement(NewChampTable, { rows: [row] }))).toContain('title="1 game"');
    expect(renderToStaticMarkup(createElement(MatchupTable, { rows: [{ champion: ahri, role: "middle", lane: true, winRate: 1, delta: 0, games: 1 }] }))).toContain("100% WR · 1 game");
  });
});
