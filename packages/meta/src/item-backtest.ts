import { rankSlot, traitCutsFrom, type LoadoutConfig } from "@ldc/engine";
import type { ChampionBuild, ExpectedWinTable, MatchSummary } from "@ldc/shared";
import { BandAggregator } from "./aggregate";
import { BuildAggregator, completedPurchases } from "./builds";
import type { MetaConfig } from "./config";

export interface ItemBacktestInput {
  /** Matches to learn builds from (band and the band above), and held-out newer ones with timelines. */
  train: MatchSummary[];
  test: MatchSummary[];
  now: number;
  meta: MetaConfig;
  loadout: LoadoutConfig;
  completed: ReadonlySet<number>;
}

export interface HitRates {
  top1: number;
  top3: number;
}

export interface ItemBacktestResult {
  /** Held-out completed-item purchases with a build and at least one candidate at their slot. */
  purchases: number;
  /** How often the real purchase was our #1 / in our top 3, and the same for "most bought at this slot". */
  ranked: HitRates;
  popular: HitRates;
  /**
   * Mean win added (result − expected win for the state at purchase) of held-out purchases
   * that matched our #1, and of the rest. Agreeing with us should be positive and above the rest.
   */
  agree: { n: number; winAdded: number };
  disagree: { n: number; winAdded: number };
}

function expectedAt(table: ExpectedWinTable, minute: number, goldDiff: number): number {
  const bucket = (edges: number[], x: number) => {
    let i = 0;
    while (i < edges.length && x >= edges[i]!) i++;
    return i;
  };
  return table.winRate[bucket(table.minutes, minute)]?.[bucket(table.goldDiff, goldDiff)] ?? 0.5;
}

/**
 * Replays held-out timelines (DESIGN.md "Item ranking", Evaluation): at every real
 * completed-item purchase, ranks that slot from the training builds (the draft only, and
 * the items the player had already finished) and checks the top-1 / top-3 hit rate against
 * a "most bought" baseline, and whether purchases that agree with our #1 add win.
 */
export function backtestItems(input: ItemBacktestInput): ItemBacktestResult {
  const { aggregation, builds } = input.meta;
  const band = new BandAggregator({ band: 0, now: input.now, config: aggregation, metrics: [] });
  for (const m of input.train) band.add(m);
  const base = band.finish();
  const attributes = new Map(base.attributes.map((a) => [a.championId, a]));
  const traitCuts = traitCutsFrom(base.champions, attributes);
  const agg = new BuildAggregator({
    now: input.now,
    halfLifeDays: aggregation.halfLifeDays,
    windowDays: aggregation.windowDays,
    minDurationSec: aggregation.minDurationSec,
    config: builds,
    completed: input.completed,
    attributes,
    traitCuts,
  });
  for (const m of input.train) agg.add(m);
  const byKey = new Map<string, ChampionBuild>(agg.finish().map((b) => [`${b.championId}|${b.role}`, b]));
  const table = agg.expectedWinTable();

  let purchases = 0;
  const hits = { r1: 0, r3: 0, p1: 0, p3: 0 };
  const agree = { n: 0, sum: 0 };
  const disagree = { n: 0, sum: 0 };

  for (const m of input.test) {
    const t = m.timeline;
    if (!t) continue;
    const teamGold = new Map<number, number[]>();
    m.participants.forEach((p, i) => {
      const g = teamGold.get(p.teamId) ?? [];
      (t.gold[i] ?? []).forEach((v, f) => (g[f] = (g[f] ?? 0) + v));
      teamGold.set(p.teamId, g);
    });
    m.participants.forEach((p, i) => {
      const build = byKey.get(`${p.championId}|${p.position}`);
      if (!build) return;
      const enemies = m.participants.filter((q) => q.teamId !== p.teamId).map((q) => q.championId);
      const input2 = { build, enemies, laneOpponent: null, attributes, traitCuts, config: input.loadout };
      const bought = completedPurchases(t, i, input.completed).slice(0, input.loadout.slots);
      const owned = new Set<number>();
      bought.forEach((x, k) => {
        const slot = k + 1;
        const ranked = rankSlot(input2, slot, owned);
        owned.add(x.itemId);
        if (!ranked.length) return;
        purchases++;
        const ours = ranked.slice(0, 3).map((r) => r.itemId);
        const popular = [...ranked].sort((a, b) => b.share - a.share).slice(0, 3).map((r) => r.itemId);
        if (ours[0] === x.itemId) hits.r1++;
        if (ours.includes(x.itemId)) hits.r3++;
        if (popular[0] === x.itemId) hits.p1++;
        if (popular.includes(x.itemId)) hits.p3++;
        const mine = teamGold.get(p.teamId) ?? [];
        const theirs = [...teamGold].find(([id]) => id !== p.teamId)?.[1] ?? [];
        const f = Math.min(Math.floor(x.sec / 60), mine.length - 1, theirs.length - 1);
        const diff = f >= 0 ? mine[f]! - theirs[f]! : 0;
        const wa = (p.win ? 1 : 0) - expectedAt(table, Math.floor(x.sec / 60), diff);
        const side = ours[0] === x.itemId ? agree : disagree;
        side.n++;
        side.sum += wa;
      });
    });
  }
  const rate = (k: number) => (purchases ? k / purchases : NaN);
  return {
    purchases,
    ranked: { top1: rate(hits.r1), top3: rate(hits.r3) },
    popular: { top1: rate(hits.p1), top3: rate(hits.p3) },
    agree: { n: agree.n, winAdded: agree.n ? agree.sum / agree.n : NaN },
    disagree: { n: disagree.n, winAdded: disagree.n ? disagree.sum / disagree.n : NaN },
  };
}
