import { describe, expect, it } from "vitest";
import type { ChampionAttributes, RolePool } from "@ldc/engine";
import type { AdviceRecord } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { lockInTerms } from "../src/main/advice-log";
import { poolAdvice, uiCopy } from "../src/main/personal-coach";

const config = loadConfig(findConfigDir(__dirname));
const { templates } = config.explain;
const names: Record<number, string> = { 1: "Gwen", 2: "Yone", 3: "Akali", 4: "Riven", 5: "Irelia", 6: "Fiora" };
const lookup = (id: number) => (names[id] ? { id, key: String(id), name: names[id]!, iconUrl: "" } : undefined);
const attr = (id: number, a: Partial<ChampionAttributes>): ChampionAttributes => ({
  championId: id, samples: 30, physicalShare: 0.2, magicShare: 0.8, trueShare: 0, frontline: 0.1, engage: 0.1, roleShares: {}, roleSamples: 0, ...a,
});

describe("post-game terms", () => {
  it("keeps your pick's three biggest win-chance parts at lock-in, biggest first, with labels from config", () => {
    const record = {
      pick: {
        championId: 1,
        expectedWin: 0.51,
        terms: [
          { name: "meta", rating: 0, deltaWin: 0.004, games: 100 },
          { name: "lane", rating: 0, deltaWin: -0.008, games: 100 },
          { name: "personal", rating: 0, deltaWin: 0.009, games: 10 },
          { name: "team", rating: 0, deltaWin: -0.012, games: 0 },
          { name: "synergy", rating: 0, deltaWin: 0, games: 0 },
        ],
      },
    } as unknown as AdviceRecord;
    expect(lockInTerms(record, templates)).toEqual([
      { label: "Team needs", deltaWin: -0.012 },
      { label: "Your comfort", deltaWin: 0.009 },
      { label: "Lane matchup", deltaWin: -0.008 },
    ]);
    // Old entries without terms: none (the card falls back to its reason lines).
    expect(lockInTerms({ pick: { championId: 1, expectedWin: null } } as unknown as AdviceRecord, templates)).toEqual([]);
  });
});

describe("pool advice", () => {
  const pool = (holes: RolePool["holes"], needs: RolePool["needs"] = ["magic", "physical", "frontline", "engage"]): RolePool => ({
    role: "top",
    needs,
    champions: [
      { championId: 1, tier: "main", games: 4, winRate: 0.5, comfort: 0.6 },
      { championId: 2, tier: "rusty", games: 0, winRate: null, comfort: 0.2 },
      { championId: 3, tier: "rusty", games: 0, winRate: null, comfort: 0.2 },
      { championId: 6, tier: "learning", games: 2, winRate: 0.5, comfort: 0.1 },
      { championId: 4, tier: "rusty", games: 0, winRate: null, comfort: 0.1 },
      { championId: 5, tier: "rusty", games: 0, winRate: null, comfort: 0.1 },
    ],
    holes,
  });
  const attributes = new Map([
    [1, attr(1, {})],
    [2, attr(2, { physicalShare: 0.9, magicShare: 0.1, frontline: 0.9 })],
  ]);
  const cov = config.engine.pool.coverage;

  it("builds the matrix rows, marks only the role's holes as gaps, and leaves unmeasured champions out", () => {
    const a = poolAdvice("top", pool([{ need: "physical", coveredBy: [2], lossesLacking: 3, losses: 5 }]), attributes, cov, templates, lookup);
    expect(a.coverage!.needs.map((n) => [n.label, n.gap])).toEqual([
      ["Magic damage", false],
      ["Physical damage", true],
      ["Frontline", false],
      ["Crowd control", false],
    ]);
    expect(a.coverage!.covers[1]).toEqual(["magic"]);
    expect(a.coverage!.covers[2]).toEqual(expect.arrayContaining(["physical", "frontline"]));
    expect(a.coverage!.covers[3]).toBeUndefined();
    // The two champions past the matrix's columns are listed under it.
    expect(a.also).toBe("Also rusty: Riven, Irelia");
  });

  it("suggests the champion you know that fills the biggest gap, and says what nothing you know covers", () => {
    const a = poolAdvice(
      "top",
      pool([
        { need: "physical", coveredBy: [2], lossesLacking: 3, losses: 5 },
        { need: "frontline", coveredBy: [2], lossesLacking: 2, losses: 5 },
        { need: "engage", coveredBy: [], lossesLacking: 2, losses: 5 },
      ]),
      attributes,
      cov,
      templates,
      lookup,
    );
    expect(a.nextStep).toMatchObject({ champion: { name: "Yone" }, title: "Play Yone again", text: "It adds physical damage and a frontline to your top pool, and you already have games on it." });
    expect(a.nextStep!.evidence).toContain("3 of your last 5");
    expect(a.missing).toBe("Still missing: crowd control. None of your top champions bring it.");
    const none = poolAdvice("top", pool([]), attributes, cov, templates, lookup);
    expect(none.nextStep).toBeNull();
    expect(none.missing).toBeNull();
    expect(none.noGaps).toBe("No gap in your top pool shows up in your losses.");
    expect(poolAdvice("top", null, attributes, cov, templates, lookup).coverage).toBeNull();
    // Only the needs the role usually fills are rows: a bot laner isn't judged on frontline.
    expect(poolAdvice("bottom", pool([], ["physical"]), attributes, cov, templates, lookup).coverage!.needs.map((n) => n.need)).toEqual(["physical"]);
  });
});

describe("panel wording", () => {
  it("hands the renderer the ui.* templates without their prefix, with no numbers in them", () => {
    const copy = uiCopy(templates);
    expect(copy["connect.title"]).toBe("Connect to your coach");
    expect(Object.keys(copy).every((k) => !k.startsWith("ui."))).toBe(true);
    for (const [k, v] of Object.entries(copy)) expect(/\d/.test(v.replace(/\{[^}]*\}/g, "")), k).toBe(false);
  });
});
