import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_BOUGHT, type MatchSummary } from "@ldc/shared";
import { parseMetaConfig, SpikeAggregator, SpikeMeasure } from "../src/index";

const config = parseMetaConfig(JSON.parse(readFileSync(new URL("../../../config/meta.v1.json", import.meta.url), "utf8")));
const NOW = Date.UTC(2026, 9, 8);
const ITEM = 3031;
const MINUTES = 25;

/**
 * A mid lane game: `champion` against champion 9, both buying their first completed item at
 * minute 10. With `spike`, the champion out-earns its opponent by 150 gold a minute after the
 * item and wins a fight right after it.
 */
function game(champion: number, spike: boolean, seed: number, opts: { kills?: boolean; levels?: boolean } = {}): MatchSummary {
  const noise = (m: number) => ((seed * 7 + m * 13) % 5) * 20;
  const gold = (extra: (m: number) => number) => Array.from({ length: MINUTES }, (_, m) => 400 * m + extra(m));
  const me = gold((m) => noise(m) + (spike && m > 10 ? 150 * (m - 10) : 0));
  const them = gold(() => 0);
  return {
    matchId: `M${champion}-${seed}`,
    queueId: 420,
    gameVersion: "16.19",
    endedAt: NOW - 86_400_000,
    durationSec: MINUTES * 60,
    participants: [
      { championId: champion, position: "middle", win: true },
      { championId: 9, position: "middle", win: false },
    ],
    timeline: {
      gold: [me, them],
      items: [
        [0, 600, ITEM_BOUGHT, ITEM],
        [1, 600, ITEM_BOUGHT, ITEM],
      ],
      skills: [[], []],
      ...(opts.levels ? { levels: [Array.from({ length: MINUTES }, (_, m) => Math.min(18, 1 + Math.floor(m / 2))), Array.from({ length: MINUTES }, () => 1)] } : {}),
      ...(opts.kills ? { kills: spike ? [[680, 0, 1, 0] as [number, number, number, number]] : [[500, 0, 1, 0] as [number, number, number, number]] } : {}),
    },
  } as never;
}

const aggregator = () =>
  new SpikeAggregator({
    now: NOW,
    config: { ...config.spikes, minGames: 5, priorGames: 0 },
    minDurationSec: config.aggregation.minDurationSec,
    windowDays: config.aggregation.windowDays,
    completed: new Set([ITEM]),
  });

describe("SpikeAggregator", () => {
  it("finds a first-item spike against the role's usual gain, and none for a champion without one", () => {
    const agg = aggregator();
    for (let s = 0; s < 20; s++) {
      agg.add(game(1, true, s, { kills: true }));
      agg.add(game(2, false, s, { kills: true }));
    }
    const spikes = agg.finish();
    const item = (id: number) => spikes.find((c) => c.championId === id)!.spikes.find((x) => x.kind === "item" && x.at === 1)!;
    expect(item(1)).toMatchObject({ n: 20, minute: 10 });
    expect(item(1).gold).toBeGreaterThan(200);
    expect(item(1).goldZ).toBeGreaterThan(3);
    expect(item(1).fights).toBeGreaterThan(0);
    // The role's usual gain is the mean over every mid player (1, 2 and their opponent 9): no spike is ~0.
    expect(Math.abs(item(2).gold)).toBeLessThan(50);
    expect(Math.abs(item(2).goldZ)).toBeLessThan(2);
    // The opponent falls behind after its item in champion 1's games: a negative swing of its own.
    expect(item(9).gold).toBeLessThan(-50);
    expect(spikes.map((c) => c.championId)).toEqual([1, 2, 9]);
  });

  it("measures levels when stored, and leaves out games without timelines, remakes and old games", () => {
    const agg = aggregator();
    for (let s = 0; s < 6; s++) agg.add(game(1, false, s, { levels: true }));
    const g = game(1, true, 99);
    expect(agg.add({ ...g, timeline: undefined })).toBe(false);
    expect(agg.add({ ...g, durationSec: 60 })).toBe(false);
    expect(agg.add({ ...g, endedAt: NOW - (config.aggregation.windowDays + 1) * 86_400_000 })).toBe(false);
    expect(agg.matches).toBe(6);
    const levels = agg.finish().find((c) => c.championId === 1)!.spikes.filter((x) => x.kind === "level");
    expect(levels.map((x) => x.at)).toContain(6);
    expect(levels.every((x) => x.fights === undefined)).toBe(true);
  });

  it("checks that spikes repeat on the other half of the games", () => {
    const games = Array.from({ length: 40 }, (_, s) => [game(1, true, s), game(2, false, s), game(3, s % 4 < 2, s)]).flat();
    const opts = { now: NOW, config: { ...config.spikes, minGames: 5 }, minDurationSec: 0, windowDays: 30, completed: new Set([ITEM]) };
    const measure = new SpikeMeasure(opts);
    for (const g of games) measure.add(g);
    const { spikes, check: c } = measure.finish();
    expect(spikes.map((x) => x.championId)).toEqual([1, 2, 3, 9]);
    expect(c.pairs).toBe(4); // champions 1, 2, 3 and their opponent 9, first item each (no levels stored)
    expect(c.goldCorrelation).toBeGreaterThan(0.9);
    expect(c.signAgreement).toBe(1);
  });

  it("shrinks small samples toward no spike", () => {
    const shrunk = new SpikeAggregator({ now: NOW, config: { ...config.spikes, minGames: 5, priorGames: 100 }, minDurationSec: 0, windowDays: 30, completed: new Set([ITEM]) });
    const raw = aggregator();
    for (let s = 0; s < 10; s++) {
      for (const a of [shrunk, raw]) {
        a.add(game(1, true, s));
        a.add(game(2, false, s));
      }
    }
    const gold = (a: SpikeAggregator) => a.finish().find((c) => c.championId === 1)!.spikes[0]!.gold;
    expect(gold(shrunk)).toBeLessThan(gold(raw) / 5);
  });
});
