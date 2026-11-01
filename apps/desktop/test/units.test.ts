import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { BanTable } from "../src/renderer/components/BanTable";
import { BuildPath } from "../src/renderer/components/BuildPath";
import { DraftTerms } from "../src/renderer/components/PostGameCard";
import { tileTip } from "../src/renderer/components/SuggestedPick";
import { points, setCopy, winsPer100 } from "../src/renderer/format";
import type { BanView, LoadoutView, PostGameView } from "../src/shared/view";

const ahri = { id: 103, name: "Ahri", iconUrl: null };

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

describe("points in wins per 100 games", () => {
  it("comes from the same number, with its direction and plural", () => {
    expect(winsPer100(0.031)).toBe("about 3 more wins per 100 games");
    expect(winsPer100(-0.031)).toBe("about 3 fewer wins per 100 games");
    expect(winsPer100(0.012)).toBe("about 1 more win per 100 games");
    expect(winsPer100(-0.012)).toBe("about 1 fewer win per 100 games");
  });

  it("doesn't round a tiny number up to a win", () => {
    expect(winsPer100(0.002)).toBe("less than one win per 100 games either way");
    expect(winsPer100(null)).toBe("");
    expect(points(-0.0123)).toBe("1.2");
  });

  it("the You, Meta and Lane tiles say it on hover; without a number just what they are", () => {
    expect(tileTip("meta", 0.01)).toBe("Its strength in your rank: +1.0 points of win chance, about 1 more win per 100 games");
    expect(tileTip("meta", null)).toBe("Its strength in your rank");
  });

  it("what decided the draft says it too", () => {
    const game = { terms: [{ label: "Lane matchup", deltaWin: -0.02 }], lines: [] } as unknown as PostGameView;
    expect(renderToStaticMarkup(createElement(DraftTerms, { game }))).toContain("Lane matchup: −2.0 points of win chance, about 2 fewer wins per 100 games");
  });
});

describe("no double negatives, no raw item numbers", () => {
  it("a ban's cost has no minus after 'Costs you'", () => {
    const ban = { champion: ahri, threat: -0.012, winRate: 0.52, pickRate: 0.1, banRate: 0.1, reasons: [] } as BanView;
    const html = renderToStaticMarkup(createElement(BanTable, { bans: [ban] }));
    expect(html).toContain("Costs you 1.2 points of win chance: about 1 fewer win per 100 games");
    expect(html).not.toMatch(/Costs you [−-]/);
  });

  it("an item's win added reads in points of win chance, never '% points' or a win rate", () => {
    const top = { ...ahri, reasons: [], share: 0.4, winAdded: 0.012 };
    const loadout = { starting: null, boots: null, items: [{ slot: 1, minute: 9, top, alternatives: [] }], commonPath: null, spikeSlots: [] } as unknown as LoadoutView;
    const html = renderToStaticMarkup(createElement(BuildPath, { loadout }));
    expect(html).toContain("Players who bought it: +1.2 points of win chance vs what their game state predicted, about 1 more win per 100 games");
    expect(html).not.toContain("% points");
    expect(html).not.toMatch(/\d% win rate/i);
  });
});
