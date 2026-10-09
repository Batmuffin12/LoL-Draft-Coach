import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ParticipantSummary, Position, UserMatch } from "@ldc/shared";
import { measureMetrics, monthlyReport, parseEngineConfig, parseRankBandConfig, readMetric, sideSplit, styleProfile } from "../src/index";

const read = (n: string) => JSON.parse(readFileSync(new URL(`../../../config/${n}`, import.meta.url), "utf8"));
const engine = parseEngineConfig(read("engine.v1.json"));
const bands = parseRankBandConfig(read("rank-bands.v1.json"));
const style = engine.style!;
const playstyle = { ...engine.playstyle, minGamesPerRole: 3, minReferenceSamples: 3 };
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const player = (o: Partial<ParticipantSummary>): ParticipantSummary =>
  ({ championId: 1, teamId: 100, position: "middle", win: false, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0, physicalDamage: 0, magicDamage: 0, trueDamage: 0, damageTaken: 0, selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {}, ...o }) as ParticipantSummary;
let id = 0;
/** A 10-minute game: you (`me`) and the enemy in your position (`them`). */
const game = (daysAgo: number, me: Partial<ParticipantSummary>, them: Partial<ParticipantSummary> = {}): UserMatch => ({
  match: { matchId: `EUW1_${id++}`, queueId: 420, gameVersion: "16.19", endedAt: NOW - daysAgo * DAY, durationSec: 600, participants: [player(me), player({ teamId: 200, position: me.position ?? "middle", ...them })] },
  me: 0,
});

describe("readMetric kda", () => {
  it("is kills plus assists over deaths, with no deaths counted as one", () => {
    expect(readMetric(player({ kills: 4, assists: 6, deaths: 2 }), 600, "kda")).toBe(5);
    expect(readMetric(player({ kills: 3, assists: 1, deaths: 0 }), 600, "kda")).toBe(4);
  });
});

describe("measureMetrics", () => {
  it("measures each headline number against the others in your role, in config order", () => {
    // You farm 80 per 10 minutes (8/min), your lane opponents 60 (6/min).
    const ms = Array.from({ length: 6 }, (_, i) => game(i, { cs: 80 }, { cs: 60 }));
    const [cs, deaths] = measureMetrics(ms, "middle", ["csPerMinute", "-deathsPerMinute"], NOW, playstyle)!;
    expect(cs).toMatchObject({ metric: "csPerMinute", you: 8, reference: 6, games: 6 });
    expect(cs!.percentile).toBe(1);
    expect(deaths).toMatchObject({ metric: "deathsPerMinute", lowerIsBetter: true, you: 0, reference: 0 });
  });

  it("is null below the role's minimum games", () => {
    expect(measureMetrics([game(1, {})], "middle", ["csPerMinute"], NOW, playstyle)).toBeNull();
  });
});

describe("styleProfile", () => {
  const tags: Record<number, string[]> = { 1: ["Mage"], 2: ["Assassin", "Mage"], 3: ["Mage", "Support"], 4: ["Fighter"] };
  // 10 mid games: 6 on champion 1, 3 on 2, 1 on 4; and 2 jungle games that don't count.
  const ms = [
    ...Array.from({ length: 6 }, (_, i) => game(i, { championId: 1, magicDamage: 900, trueDamage: 100 })),
    ...Array.from({ length: 3 }, (_, i) => game(10 + i, { championId: 2, physicalDamage: 1000 })),
    game(20, { championId: 4, physicalDamage: 500 }),
    game(1, { championId: 3, position: "jungle" }),
    game(2, { championId: 3, position: "jungle" }),
  ];
  const p = styleProfile(ms, "middle", NOW, { playstyle, style }, (c) => tags[c], undefined)!;

  it("measures pool focus on your top champions", () => {
    expect(p.games).toBe(10);
    expect(p.focus.champions).toBe(3);
    expect(p.focus.top).toEqual([
      { n: 1, share: 0.6 },
      { n: 3, share: 1 },
      { n: 5, share: 1 },
    ]);
  });

  it("counts each game's champion class by its first tag, leaving out small ones", () => {
    expect(p.classes).toEqual([
      { tag: "Mage", share: 0.6 },
      { tag: "Assassin", share: 0.3 },
      { tag: "Fighter", share: expect.closeTo(0.1) },
    ]);
    const strict = styleProfile(ms, "middle", NOW, { playstyle, style: { ...style, minClassShare: 0.2 } }, (c) => tags[c], undefined)!;
    expect(strict.classes.map((c) => c.tag)).toEqual(["Mage", "Assassin"]);
  });

  it("splits your damage to champions by type", () => {
    // 5400 magic + 600 true (champion 1), 3500 physical.
    expect(p.damage!.physical).toBeCloseTo(3500 / 9500);
    expect(p.damage!.magic).toBeCloseTo(5400 / 9500);
    expect(p.damage!.true).toBeCloseTo(600 / 9500);
  });

  it("uses only your last `window` games in the role", () => {
    const recent = styleProfile(ms, "middle", NOW, { playstyle, style: { ...style, window: 6 } }, (c) => tags[c], undefined)!;
    expect(recent.games).toBe(6);
    expect(recent.focus.top[0]).toEqual({ n: 1, share: 1 });
  });

  it("is null below the minimum games in the role", () => {
    expect(styleProfile(ms, "jungle", NOW, { playstyle, style }, (c) => tags[c], undefined)).toBeNull();
  });
});

describe("sideSplit", () => {
  const side = (n: number, teamId: number, wins: number) => Array.from({ length: n }, (_, i) => game(i, { teamId, win: i < wins }));

  it("names the better side only when the gap is real", () => {
    const real = sideSplit([...side(100, 100, 65), ...side(100, 200, 40)], style.side)!;
    expect(real.blue).toEqual({ games: 100, winRate: 0.65 });
    expect(real.red).toEqual({ games: 100, winRate: 0.4 });
    expect(real.better).toBe("blue");
  });

  it("says nothing for a gap chance explains (op.gg's 52% vs 48% over 295 games)", () => {
    expect(sideSplit([...side(136, 100, 71), ...side(159, 200, 77)], style.side)!.better).toBeNull();
  });

  it("needs enough games on each side", () => {
    expect(sideSplit([...side(10, 100, 10), ...side(10, 200, 0)], style.side)!.better).toBeNull();
    expect(sideSplit(side(10, 100, 5), style.side)).toBeNull();
  });
});

describe("monthlyReport numbers, roles and focus", () => {
  const cfg = { report: { ...engine.report, trend: { minGamesPerSide: 5, z: 2.4, minChange: 5 } }, playstyle: { ...playstyle, axes: { farming: { metrics: ["csPerMinute"] } } } };
  const mid = (daysAgo: number, cs: number, championId: number, position: Position = "middle") => game(daysAgo, { cs, championId, position, deaths: 2, kills: 2, assists: 2 }, { cs: 70 });
  // Before: 10 mid games farming 50-59 on 5 champions. This month: 10 mid games farming 80-89 on 2 champions, 2 top games.
  const ms = [
    ...Array.from({ length: 10 }, (_, i) => mid(35 + i, 50 + i, 1 + (i % 5))),
    ...Array.from({ length: 10 }, (_, i) => mid(1 + i, 80 + i, 1 + (i % 2))),
    mid(3, 60, 9, "top"),
    mid(4, 60, 9, "top"),
  ];
  const r = monthlyReport(ms, NOW, cfg, { bands });

  it("compares raw numbers in your main role, marking only real changes", () => {
    const cs = r.stats.find((s) => s.metric === "csPerMinute")!;
    expect(cs.from).toBeCloseTo(5.45);
    expect(cs.to).toBeCloseTo(8.45);
    expect(cs.changed).toBe("up");
    const kda = r.stats.find((s) => s.metric === "kda")!;
    expect(kda).toMatchObject({ from: 2, to: 2, changed: "steady" });
    expect(r.stats.find((s) => s.metric === "deathsPerMinute")!.lowerIsBetter).toBe(true);
  });

  it("gives the period's role shares and pool focus against the period before", () => {
    expect(r.roles).toEqual([
      { role: "middle", share: 10 / 12 },
      { role: "top", share: 2 / 12 },
    ]);
    // Top 3 this month: 5 + 5 + 2 of 12; before: 2 + 2 + 2 of 10.
    expect(r.focus).toEqual({ n: 3, now: 1, before: 0.6 });
  });

  it("leaves the numbers out without the config", () => {
    const bare = monthlyReport(ms, NOW, { ...cfg, report: { ...cfg.report, stats: undefined, focusTop: undefined } }, { bands });
    expect(bare.stats).toEqual([]);
    expect(bare.focus).toBeNull();
  });
});
