import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { metricImportance, parseEngineConfig, pickFocus } from "../src/index";

const engine = parseEngineConfig(JSON.parse(readFileSync(new URL("../../../config/engine.v1.json", import.meta.url), "utf8")));
// Two metrics only, so each test reads clearly: CS per minute, and deaths per minute (lower is better).
const cfg = {
  growth: { ...engine.growth, window: 20, checkGames: 10, targetStep: 0.5, minGames: 8, minImportance: 0.02 },
  playstyle: { ...engine.playstyle, minReferenceSamples: 20, axes: { farming: { metrics: ["csPerMinute"] }, risk: { metrics: ["-deathsPerMinute"] } } },
};

const player = (championId: number, position: string, win: boolean, cs: number, deaths: number): ParticipantSummary =>
  ({ championId, teamId: 100, position, win, kills: 0, deaths, assists: 0, cs, gold: 0, visionScore: 0, physicalDamage: 0, magicDamage: 0, trueDamage: 0, damageTaken: 0, selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {} }) as ParticipantSummary;

/**
 * Your game i (0 = newest, 10-minute games): you farm `cs` and die `deaths` times. The other mid
 * in each game is a reference player: they farm 60–100 and win when they farm well, so CS
 * separates wins from losses; their deaths don't.
 */
function game(i: number, championId: number, cs: number, deaths = 3, role = "middle"): UserMatch {
  const theirCs = 60 + ((i * 7) % 41);
  return {
    match: {
      matchId: `EUW1_${1000 - i}`,
      queueId: 420,
      gameVersion: "16.19.1",
      endedAt: 1_000_000 - i * 1000,
      durationSec: 600,
      participants: [player(championId, role, true, cs, deaths), player(1, role, theirCs >= 80, theirCs, 2 + (i % 3))],
    },
    me: 0,
  };
}

describe("metricImportance", () => {
  it("is the win-rate gap between the top and bottom halves of a metric", () => {
    const s = [1, 2, 3, 4].map((value) => ({ value, win: value > 2 }));
    expect(metricImportance(s)).toBe(1);
    expect(metricImportance(s.map((x) => ({ ...x, win: !x.win })))).toBe(-1);
    expect(metricImportance([{ value: 1, win: true }])).toBe(0);
  });
});

describe("pickFocus", () => {
  it("picks the metric that matters and where you are below typical, on your main champion", () => {
    // 20 Ahri games farming 60 (typical is ~80); a few games on another champion.
    const matches = [...Array.from({ length: 20 }, (_, i) => game(i, 103, 60)), ...Array.from({ length: 3 }, (_, i) => game(30 + i, 245, 90))];
    const f = pickFocus(matches, "middle", cfg)!;
    expect(f.championId).toBe(103);
    expect(f.reference).toBe("games");
    expect(f.focus?.metric).toBe("csPerMinute");
    expect(f.focus!.baseline).toBeCloseTo(6);
    expect(f.focus!.typical).toBeGreaterThan(7);
    // Halfway from your baseline to typical.
    expect(f.focus!.target).toBeCloseTo((f.focus!.baseline + f.focus!.typical) / 2);
    expect(f.focus!.recent).toHaveLength(10);
    expect(f.focus!.recent.every((x) => !x)).toBe(true);
    expect(f.focus!.done).toBe(false);
    // Deaths don't separate wins from losses here: never a focus.
    expect([f.focus, ...f.met].some((m) => m?.metric === "deathsPerMinute")).toBe(false);
  });

  it("marks the focus met when your last games reach the target, and moves on", () => {
    // Older games at 60, your last 10 at 85: past the target.
    const matches = Array.from({ length: 20 }, (_, i) => game(i, 103, i < 10 ? 85 : 60));
    const f = pickFocus(matches, "middle", cfg)!;
    expect(f.focus).toBeNull();
    expect(f.met.map((m) => m.metric)).toEqual(["csPerMinute"]);
    expect(f.met[0]!.recent.every(Boolean)).toBe(true);
  });

  it("uses the band's typical values and importance when the snapshot has them, lower-is-better included", () => {
    const matches = Array.from({ length: 20 }, (_, i) => game(i, 103, 80, 8));
    const q = (lo: number, hi: number) => Array.from({ length: 11 }, (_, i) => lo + ((hi - lo) * i) / 10);
    const f = pickFocus(matches, "middle", cfg, {
      csPerMinute: { n: 500, quantiles: q(5, 10), importance: 0.1 },
      deathsPerMinute: { n: 500, quantiles: q(0.1, 0.7), importance: -0.12 },
    })!;
    expect(f.reference).toBe("band");
    // You die 0.8 a minute (typical 0.4): fewer deaths is the focus, with a lower target.
    expect(f.focus?.metric).toBe("deathsPerMinute");
    expect(f.focus!.lowerIsBetter).toBe(true);
    expect(f.focus!.target).toBeCloseTo(0.6);
  });

  it("needs enough games in the role, and focuses on the whole role without a main champion", () => {
    expect(pickFocus(Array.from({ length: 5 }, (_, i) => game(i, 103, 60)), "middle", cfg)).toBeNull();
    const spread = Array.from({ length: 20 }, (_, i) => game(i, 100 + (i % 4), 60));
    expect(pickFocus(spread, "middle", cfg)!.championId).toBeNull();
  });
});
