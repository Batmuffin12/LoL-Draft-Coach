import { ENEMY_TRAITS, halfLifeWeight, teamTraits } from "@ldc/engine";
import {
  ITEM_BOUGHT,
  ITEM_SOLD,
  type ChampionAttributes,
  type ChampionBuild,
  type ChampionId,
  type EnemyTrait,
  type ExpectedWinTable,
  type ItemSlotStat,
  type MatchSummary,
  type MatchTimeline,
  type OptionStat,
  type ParticipantSummary,
  type Position,
  type RunePageStat,
  type SituationalLift,
} from "@ldc/shared";
import type { MetaConfig } from "./config";

const DAY_MS = 86_400_000;
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

type BuildsConfig = MetaConfig["builds"];

interface Opt<T> extends OptionStat {
  value: T;
}

/**
 * Counts options (rune pages, starts, paths…) in bounded memory with the space-saving
 * algorithm: at most `capacity` entries; a new option replaces the least taken one and
 * inherits its counts, so the common options (the only ones published) stay exact or close.
 */
class OptionCounter<T> {
  private readonly map = new Map<string, Opt<T>>();

  constructor(private readonly capacity = Infinity) {}

  add(key: string, value: T, w: number, won: boolean): void {
    let o = this.map.get(key);
    if (!o) {
      if (this.map.size >= this.capacity) {
        let minKey = "";
        let min: Opt<T> | null = null;
        for (const [k, x] of this.map) if (!min || x.n < min.n) [minKey, min] = [k, x];
        this.map.delete(minKey);
        o = { value, games: min!.games, wins: min!.wins, n: min!.n };
      } else o = { value, games: 0, wins: 0, n: 0 };
      this.map.set(key, o);
    }
    o.games += w;
    if (won) o.wins += w;
    o.n++;
  }

  top(max: number, minGames: number): Opt<T>[] {
    return [...this.map.values()]
      .filter((o) => o.n >= minGames)
      .sort((a, b) => b.games - a.games || b.n - a.n)
      .slice(0, max);
  }
}

interface SlotAcc {
  n: number;
  wins: number;
  minutes: number;
  /** Sum of the expected win of the states the purchases were made in (with a fitted table)… */
  expected: number;
  /** …or, without one, purchases per state bin (resolved against this pass's own table at the end). */
  bins: Map<number, number> | null;
}

/** Per trait: [games with the trait low, games with it high], packed as 2 numbers per trait. */
type TraitCounts = Int32Array;
const emptyTraits = (): TraitCounts => new Int32Array(ENEMY_TRAITS.length * 2);
const TRAIT_INDEX = new Map(ENEMY_TRAITS.map((t, i) => [t, i]));
const side = (c: TraitCounts, t: EnemyTrait, s: 0 | 1) => c[TRAIT_INDEX.get(t)! * 2 + s]!;

/**
 * Expected win for a team by minute and team gold difference, fitted over every team-minute of
 * the timelines it's fed (smoothed toward 50%). Used for win added at purchase time.
 */
export class ExpectedWinFitter {
  private readonly n: number[];
  private readonly w: number[];
  private readonly goldBuckets: number;

  constructor(private readonly bins: { minutes: number[]; goldDiff: number[]; priorGames: number }) {
    this.goldBuckets = bins.goldDiff.length + 1;
    this.n = new Array((bins.minutes.length + 1) * this.goldBuckets).fill(0);
    this.w = new Array((bins.minutes.length + 1) * this.goldBuckets).fill(0);
  }

  bin(minute: number, goldDiff: number): number {
    return bucket(this.bins.minutes, minute) * this.goldBuckets + bucket(this.bins.goldDiff, goldDiff);
  }

  add(m: MatchSummary): void {
    const t = m.timeline;
    if (!t) return;
    const teamGold = new Map<number, number[]>();
    m.participants.forEach((p, i) => {
      const g = teamGold.get(p.teamId) ?? [];
      (t.gold[i] ?? []).forEach((v, f) => (g[f] = (g[f] ?? 0) + v));
      teamGold.set(p.teamId, g);
    });
    const teams = [...teamGold.keys()];
    if (teams.length !== 2) return;
    for (const team of teams) {
      const mine = teamGold.get(team)!;
      const theirs = teamGold.get(teams.find((x) => x !== team)!)!;
      const won = m.participants.find((p) => p.teamId === team)!.win;
      for (let f = 1; f < Math.min(mine.length, theirs.length); f++) {
        const b = this.bin(f, mine[f]! - theirs[f]!);
        this.n[b]!++;
        if (won) this.w[b]!++;
      }
    }
  }

  /** Smoothed expected win per bin (flat). */
  values(): number[] {
    const k = this.bins.priorGames;
    return this.n.map((n, b) => (this.w[b]! + 0.5 * k) / (n + k));
  }

  table(): ExpectedWinTable {
    const e = this.values();
    const rows: number[][] = [];
    for (let i = 0; i < e.length; i += this.goldBuckets) rows.push(e.slice(i, i + this.goldBuckets).map((x) => round(x)));
    return { minutes: this.bins.minutes, goldDiff: this.bins.goldDiff, winRate: rows, n: this.n.reduce((a, b) => a + b, 0) };
  }
}

/** Expected win for a state from a fitted table. */
export function expectedWinAt(table: ExpectedWinTable, minute: number, goldDiff: number): number {
  return table.winRate[bucket(table.minutes, minute)]?.[bucket(table.goldDiff, goldDiff)] ?? 0.5;
}

class BuildAcc {
  n = 0;
  timelineN = 0;
  games = 0;
  wins = 0;
  readonly pages: OptionCounter<Omit<RunePageStat, keyof OptionStat>>;
  readonly spells: OptionCounter<number[]>;
  readonly skills: OptionCounter<{ first: number[]; order: number[] }>;
  readonly starting: OptionCounter<number[]>;
  readonly core: OptionCounter<number[]>;
  readonly slots = new Map<number, SlotAcc>() // key: itemId * 16 + slot;
  /** Games that reached each completed-item slot. */
  readonly slotGames: number[] = [];
  readonly traitGames = emptyTraits();
  /** Power spikes: per first item, the lead-slope changes' count, sum and sum of squares. */
  readonly spikes = new Map<number, Moments>();
  /** "rune:id" / "item:id" → games taken per trait side. */
  readonly takes = new Map<number, TraitCounts>() // key: rune id, or -item id;
  /**
   * Into each lane opponent: games, rune pages, and (timeline games) starting items and the first
   * completed item. Only the most frequent opponents are tracked (bounded, space-saving style).
   */
  readonly opponents = new Map<ChampionId, OpponentAcc>();
  private readonly matchupCapacity: number;
  private readonly opponentCapacity: number;

  /** The opponent's record; a new opponent replaces the least seen one when the map is full. */
  opponent(id: ChampionId): OpponentAcc {
    let o = this.opponents.get(id);
    if (o) return o;
    let games = 0;
    if (this.opponents.size >= this.opponentCapacity) {
      let minId = 0;
      let min: OpponentAcc | null = null;
      for (const [k, x] of this.opponents) if (!min || x.games < min.games) [minId, min] = [k, x];
      this.opponents.delete(minId);
      games = min!.games;
    }
    o = { games, tgames: 0, pages: new OptionCounter(this.matchupCapacity), starting: new OptionCounter(this.matchupCapacity), first: new Map() };
    this.opponents.set(id, o);
    return o;
  }

  constructor(
    readonly championId: ChampionId,
    readonly role: Position,
    capacity: number,
    opponents: number,
  ) {
    this.pages = new OptionCounter(capacity);
    this.spells = new OptionCounter(capacity);
    this.skills = new OptionCounter(capacity);
    this.starting = new OptionCounter(capacity);
    this.core = new OptionCounter(capacity);
    this.matchupCapacity = 2;
    this.opponentCapacity = Math.max(1, opponents);
  }
}

interface OpponentAcc {
  games: number;
  tgames: number;
  pages: OptionCounter<Omit<RunePageStat, keyof OptionStat>>;
  starting: OptionCounter<number[]>;
  first: Map<number, number>;
}

export interface BuildAggregatorOptions {
  now: number;
  /** Recency weighting and window, as for the band's stats. */
  halfLifeDays: number;
  windowDays: number;
  minDurationSec: number;
  config: BuildsConfig;
  /** Completed items (derived from Data Dragon with the engine's item rules). */
  completed: ReadonlySet<number>;
  /** Completed boots (not a first item for power spikes). */
  boots?: ReadonlySet<number>;
  /** Measured champion attributes (the band's), for enemy-team traits. */
  attributes: ReadonlyMap<ChampionId, ChampionAttributes>;
  /** Band-average trait values: above, a trait counts as high. */
  traitCuts: Record<EnemyTrait, number>;
  /**
   * Expected win per state, fitted beforehand (the server fits it in the first pass), so win
   * added is summed per purchase instead of keeping a histogram per item and slot (memory).
   * Without it, this pass fits its own.
   */
  expected?: ExpectedWinTable;
}

const pageKey = (p: NonNullable<ParticipantSummary["perks"]>) => `${p.primaryStyle}|${p.subStyle}|${p.runes.join(",")}|${p.statPerks.join(",")}`;

function bucket(edges: number[], x: number): number {
  let i = 0;
  while (i < edges.length && x >= edges[i]!) i++;
  return i;
}

/** The order basic skills (slots 1–3) are maxed: by when each reached its last point, then by points. */
export function maxOrder(skills: number[]): number[] {
  const points = new Map<number, number>();
  const finishedAt = new Map<number, number>();
  skills.forEach((slot, i) => {
    if (slot < 1 || slot > 3) return;
    const p = (points.get(slot) ?? 0) + 1;
    points.set(slot, p);
    finishedAt.set(slot, i);
  });
  const max = Math.max(0, ...points.values());
  return [1, 2, 3].sort((a, b) => {
    const pa = points.get(a) ?? 0;
    const pb = points.get(b) ?? 0;
    // A skill with all its points was maxed; among those, the one that got there first.
    if (pa === max && pb === max) return finishedAt.get(a)! - finishedAt.get(b)!;
    return pb - pa || (skills.indexOf(a) + 1 || 99) - (skills.indexOf(b) + 1 || 99);
  });
}

/** Each participant's completed items in purchase order (first purchase of each), with the second bought. */
export function completedPurchases(t: MatchTimeline, participant: number, completed: ReadonlySet<number>): { itemId: number; sec: number }[] {
  const seen = new Set<number>();
  const out: { itemId: number; sec: number }[] = [];
  for (const [p, sec, kind, id] of t.items) {
    if (p !== participant || kind !== ITEM_BOUGHT || !completed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ itemId: id, sec });
  }
  return out;
}

interface Moments {
  n: number;
  sum: number;
  sq: number;
}
const addMoment = (m: Moments, x: number) => {
  m.n++;
  m.sum += x;
  m.sq += x * x;
};
const momentStats = (m: Moments): { mean: number; se: number } | null => {
  if (m.n < 2) return null;
  const mean = m.sum / m.n;
  const variance = Math.max(0, (m.sq - m.n * mean * mean) / (m.n - 1));
  return { mean, se: Math.sqrt(variance / m.n) };
};

/**
 * How much faster a player's gold lead over their lane opponent grew in the `window` minutes
 * after finishing `first` than in the `window` minutes before (gold per minute). Null when the
 * timeline doesn't cover both windows.
 */
export function leadSlopeChange(t: MatchTimeline, me: number, opp: number, first: { itemId: number; sec: number } | undefined, window: number): { itemId: number; change: number } | null {
  if (!first || opp < 0) return null;
  const m = Math.round(first.sec / 60);
  const lead = (f: number) => {
    const a = t.gold[me]?.[f], b = t.gold[opp]?.[f];
    return a === undefined || b === undefined ? undefined : a - b;
  };
  const l0 = lead(m - window), l1 = lead(m), l2 = lead(m + window);
  if (m - window < 1 || l0 === undefined || l1 === undefined || l2 === undefined) return null;
  return { itemId: first.itemId, change: (l2 - l1 - (l1 - l0)) / window };
}

/** Items bought in the first `seconds` and not sold again in that time. */
export function startingItems(t: MatchTimeline, participant: number, seconds: number): number[] {
  const bag: number[] = [];
  for (const [p, sec, kind, id] of t.items) {
    if (p !== participant || sec > seconds) continue;
    if (kind === ITEM_BOUGHT) bag.push(id);
    else if (kind === ITEM_SOLD) {
      const i = bag.indexOf(id);
      if (i >= 0) bag.splice(i, 1);
    }
  }
  return bag.sort((a, b) => a - b);
}

/**
 * Builds per champion-role from collected matches (pure; feed it the band's matches and
 * the band above's). End-of-game data gives rune pages and summoner spells; timelines give
 * skill order, starting items, the core path and, for each completed item at each build
 * slot, the **win added**: the buyer's result minus the expected win of the game state
 * (minute, team gold difference) when it was bought, so items bought by players who are
 * already ahead don't look strong (DESIGN.md "Item ranking", C1). Situational runes and
 * items are found by lift against enemy-team traits, never from lists.
 */
export class BuildAggregator {
  private readonly builds = new Map<string, BuildAcc>();
  /** Power spikes: the same moments over every champion's first item (the baseline). */
  private readonly spikeAll: Moments = { n: 0, sum: 0, sq: 0 };
  /** This pass's own expected-win fit (used when no table was given, and published). */
  private readonly fitter: ExpectedWinFitter;
  /** Per item, games it was bought or held in, per role. */
  private readonly itemRoleCounts = new Map<number, Map<string, number>>();
  /** For role quest rewards (timeline games only): per role, games, and per item, games it ended in and games it was bought in. */
  private readonly rewardCounts = new Map<string, { games: number; held: Map<number, number>; bought: Map<number, number> }>();

  constructor(private readonly opts: BuildAggregatorOptions) {
    this.fitter = new ExpectedWinFitter(opts.config.stateBins);
  }

  private acc(p: ParticipantSummary): BuildAcc {
    const key = `${p.championId}|${p.position}`;
    let b = this.builds.get(key);
    if (!b) this.builds.set(key, (b = new BuildAcc(p.championId, p.position, this.opts.config.counterCapacity, this.opts.config.maxMatchups + 10)));
    return b;
  }

  add(m: MatchSummary): boolean {
    const o = this.opts;
    if (m.endedAt <= o.now - o.windowDays * DAY_MS || m.durationSec < o.minDurationSec || !m.participants.length || !m.participants.every((p) => p.position)) return false;
    const w = halfLifeWeight(o.now - m.endedAt, o.halfLifeDays);
    const t = m.timeline;
    const cfg = o.config;
    const ps = m.participants;

    // Team gold per frame, for the state at each purchase.
    const teamGold = new Map<number, number[]>();
    if (t) {
      ps.forEach((p, i) => {
        const g = teamGold.get(p.teamId) ?? [];
        (t.gold[i] ?? []).forEach((v, f) => (g[f] = (g[f] ?? 0) + v));
        teamGold.set(p.teamId, g);
      });
      this.fitter.add(m);
    }
    const goldDiffAt = (teamId: number, sec: number) => {
      const mine = teamGold.get(teamId);
      const theirs = [...teamGold].find(([id]) => id !== teamId)?.[1];
      if (!mine || !theirs) return 0;
      const f = Math.min(Math.floor(sec / 60), mine.length - 1, theirs.length - 1);
      return f >= 0 ? mine[f]! - theirs[f]! : 0;
    };

    ps.forEach((p, i) => {
      const b = this.acc(p);
      b.n++;
      b.games += w;
      if (p.win) b.wins += w;
      const enemies = ps.filter((q) => q.teamId !== p.teamId);
      const traits = teamTraits(enemies.map((q) => q.championId), o.attributes);
      const sides = new Map<EnemyTrait, 0 | 1>();
      for (const tr of ENEMY_TRAITS) {
        const v = traits[tr];
        if (v === undefined) continue;
        const side = v > o.traitCuts[tr] ? 1 : 0;
        sides.set(tr, side);
        b.traitGames[TRAIT_INDEX.get(tr)! * 2 + side]!++;
      }
      const laneOpp = enemies.find((q) => q.position === p.position);
      const vs = laneOpp ? b.opponent(laneOpp.championId) : null;
      if (vs) vs.games++;
      const take = (key: number) => {
        let c = b.takes.get(key);
        if (!c) b.takes.set(key, (c = emptyTraits()));
        for (const [tr, s] of sides) c[TRAIT_INDEX.get(tr)! * 2 + s]!++;
      };

      if (p.perks && p.perks.runes.length) {
        const page = { primaryStyle: p.perks.primaryStyle, subStyle: p.perks.subStyle, runes: p.perks.runes, statPerks: p.perks.statPerks };
        b.pages.add(pageKey(p.perks), page, w, p.win);
        for (const r of new Set(p.perks.runes)) take(r);
        vs?.pages.add(pageKey(p.perks), page, w, p.win);
      }
      const spells = p.spells.filter((s) => s > 0).sort((x, y) => x - y);
      if (spells.length === 2) b.spells.add(spells.join(","), spells, w, p.win);

      // Which role holds each item: end-of-game inventory plus, with a timeline, every purchase.
      const held = new Set(p.items.filter((x) => x > 0));
      if (t) for (const [q, , kind, id] of t.items) if (q === i && kind === ITEM_BOUGHT) held.add(id);
      for (const id of held) {
        let r = this.itemRoleCounts.get(id);
        if (!r) this.itemRoleCounts.set(id, (r = new Map()));
        r.set(p.position, (r.get(p.position) ?? 0) + 1);
      }
      if (t) {
        let rc = this.rewardCounts.get(p.position);
        if (!rc) this.rewardCounts.set(p.position, (rc = { games: 0, held: new Map(), bought: new Map() }));
        rc.games++;
        for (const id of new Set(p.items.filter((x) => x > 0))) rc.held.set(id, (rc.held.get(id) ?? 0) + 1);
        for (const [q, , kind, id] of t.items) if (q === i && kind === ITEM_BOUGHT) rc.bought.set(id, (rc.bought.get(id) ?? 0) + 1);
      }

      if (!t) {
        // Without a timeline, the end-of-game inventory says which completed items were taken.
        for (const id of new Set(p.items.filter((x) => o.completed.has(x)))) take(-id);
        return;
      }
      b.timelineN++;
      const sk = t.skills[i] ?? [];
      if (sk.length >= cfg.minSkillPoints) {
        const first = sk.slice(0, 3);
        const order = maxOrder(sk);
        b.skills.add(`${first.join("")}|${order.join("")}`, { first, order }, w, p.win);
      }
      const start = startingItems(t, i, cfg.startingSeconds);
      if (start.length) b.starting.add(start.join(","), start, w, p.win);

      const bought = completedPurchases(t, i, o.completed);
      const spike = cfg.spikes && laneOpp ? leadSlopeChange(t, i, ps.indexOf(laneOpp), bought.find((x) => !o.boots?.has(x.itemId)), cfg.spikes.window) : null;
      if (spike) {
        addMoment(this.spikeAll, spike.change);
        let s = b.spikes.get(spike.itemId);
        if (!s) b.spikes.set(spike.itemId, (s = { n: 0, sum: 0, sq: 0 }));
        addMoment(s, spike.change);
      }
      for (const it of new Set(bought.map((x) => x.itemId))) take(-it);
      if (vs) {
        vs.tgames++;
        if (start.length) vs.starting.add(start.join(","), start, w, p.win);
        const first = bought[0]?.itemId;
        if (first !== undefined) vs.first.set(first, (vs.first.get(first) ?? 0) + 1);
      }
      if (bought.length >= 2) {
        const path = bought.slice(0, cfg.coreItems).map((x) => x.itemId);
        b.core.add(path.join(","), path, w, p.win);
        if (path.length > 2) b.core.add(path.slice(0, 2).join(","), path.slice(0, 2), w, p.win);
      }
      bought.slice(0, cfg.maxSlots).forEach((x, k) => {
        b.slotGames[k] = (b.slotGames[k] ?? 0) + 1;
        const key = x.itemId * 16 + k + 1;
        let s = b.slots.get(key);
        if (!s) b.slots.set(key, (s = { n: 0, wins: 0, minutes: 0, expected: 0, bins: o.expected ? null : new Map() }));
        s.n++;
        if (p.win) s.wins++;
        s.minutes += x.sec / 60;
        const minute = Math.floor(x.sec / 60);
        const diff = goldDiffAt(p.teamId, x.sec);
        if (o.expected) s.expected += expectedWinAt(o.expected, minute, diff);
        else {
          const bin = this.fitter.bin(minute, diff);
          s.bins!.set(bin, (s.bins!.get(bin) ?? 0) + 1);
        }
      });
    });
    return true;
  }

  /** A build's significant power spikes: first items well above the all-champion baseline. */
  private spikesOf(b: BuildAcc, c: { minGames: number; minZ: number }): NonNullable<ChampionBuild["spikes"]> {
    const all = momentStats(this.spikeAll);
    if (!all) return [];
    const out: NonNullable<ChampionBuild["spikes"]> = [];
    for (const [itemId, m] of b.spikes) {
      const s = momentStats(m);
      if (!s || m.n < c.minGames) continue;
      const se = Math.sqrt(s.se ** 2 + all.se ** 2);
      if (se > 0 && (s.mean - all.mean) / se >= c.minZ) out.push({ itemId, n: m.n, gold: Math.round(s.mean - all.mean) });
    }
    return out.sort((x, y) => y.gold - x.gold);
  }

  /** The expected-win table used for win added (the given one, or this pass's own fit). */
  expectedWinTable(): ExpectedWinTable {
    return this.opts.expected ?? this.fitter.table();
  }

  /** Share of each item's games per role, for items seen in at least `minItemRoleGames` games. */
  itemRoles(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [id, roles] of this.itemRoleCounts) {
      const total = [...roles.values()].reduce((a, b) => a + b, 0);
      if (total < this.opts.config.minItemRoleGames) continue;
      out[id] = Object.fromEntries([...roles].map(([r, n]) => [r, round(n / total)]));
    }
    return out;
  }

  /** Role quest rewards: items a role ends games with but almost never buys. */
  roleRewards(): Record<string, { itemId: number; share: number }[]> {
    const { rewardMinShare, rewardMaxBought } = this.opts.config;
    const out: Record<string, { itemId: number; share: number }[]> = {};
    for (const [role, rc] of this.rewardCounts) {
      const list = [...rc.held]
        .filter(([id, h]) => h / rc.games >= rewardMinShare && (rc.bought.get(id) ?? 0) <= rewardMaxBought * h)
        .map(([itemId, h]) => ({ itemId, share: round(h / rc.games) }))
        .sort((a, b) => b.share - a.share);
      if (list.length) out[role] = list;
    }
    return out;
  }

  finish(): ChampionBuild[] {
    const cfg = this.opts.config;
    const e = this.fitter.values();
    const out: ChampionBuild[] = [];
    for (const b of this.builds.values()) {
      if (b.n < cfg.minGames) continue;
      const opt = <T, R>(list: Opt<T>[], f: (v: T) => R) =>
        list.map((x) => ({ ...f(x.value), games: round(x.games), wins: round(x.wins), n: x.n }));

      let items: ItemSlotStat[] = [];
      for (const [key, s] of b.slots) {
        if (s.n < cfg.minItemGames) continue;
        const [itemId, slot] = [Math.floor(key / 16), key % 16];
        let expectedWins = s.expected;
        if (s.bins) for (const [bin, c] of s.bins) expectedWins += c * e[bin]!;
        items.push({
          itemId,
          slot,
          n: s.n,
          share: round(s.n / (b.slotGames[slot - 1] ?? s.n)),
          winAdded: round((s.wins - expectedWins) / (s.n + cfg.winAddedPriorGames), 4),
          minute: round(s.minutes / s.n, 1),
        });
      }
      items.sort((x, y) => x.slot - y.slot || y.n - x.n);
      // The most bought items per slot only (the snapshot stays small; rarer ones aren't suggested anyway).
      const perSlot = new Map<number, number>();
      items = items.filter((x) => {
        const c = (perSlot.get(x.slot) ?? 0) + 1;
        perSlot.set(x.slot, c);
        return c <= cfg.maxItemsPerSlot;
      });

      const lifts: SituationalLift[] = [];
      const { priorGames: k, minGames, minLift, maxPerBuild, minZ } = cfg.lift;
      for (const [key, c] of b.takes) {
        const [kind, id] = key < 0 ? (["item", -key] as const) : (["rune", key] as const);
        for (const tr of ENEMY_TRAITS) {
          const [nLow, nHigh] = [side(b.traitGames, tr, 0), side(b.traitGames, tr, 1)];
          const [cLow, cHigh] = [side(c, tr, 0), side(c, tr, 1)];
          if (nLow < minGames || nHigh < minGames || cLow + cHigh < minGames) continue;
          const base = (cLow + cHigh) / (nLow + nHigh);
          const high = (cHigh + k * base) / (nHigh + k);
          const low = (cLow + k * base) / (nLow + k);
          const lift = low > 0 ? high / low : 0;
          // Raw rates and their pooled standard error: a real difference, not a few games.
          const se = Math.sqrt(base * (1 - base) * (1 / nHigh + 1 / nLow));
          const z = se > 0 ? (cHigh / nHigh - cLow / nLow) / se : 0;
          if (lift >= minLift && z >= minZ) lifts.push({ kind, id: Number(id), trait: tr, lift: round(lift, 2), high: round(high), low: round(low), n: nLow + nHigh });
        }
      }
      lifts.sort((x, y) => y.lift - x.lift);

      // Into a lane opponent: only pages that differ from the usual one (the most common opponents first).
      const pages = opt(b.pages.top(cfg.maxOptions, cfg.minOptionGames), (v) => v);
      const usualPage = pages[0] ? pageKey(pages[0]) : null;
      const matchupPages: ChampionBuild["matchupPages"] = [];
      for (const [enemy, vs] of b.opponents) {
        const [best] = vs.pages.top(1, cfg.minMatchupGames);
        if (best && pageKey(best.value as NonNullable<ParticipantSummary["perks"]>) !== usualPage) {
          matchupPages.push({ enemy, ...best.value, games: round(best.games), wins: round(best.wins), n: best.n });
        }
      }
      matchupPages.sort((x, y) => y.n - x.n).splice(cfg.maxMatchups);
      matchupPages.sort((x, y) => x.enemy - y.enemy);
      const matchupItems: NonNullable<ChampionBuild["matchupItems"]> = [];
      const usualStart = b.starting.top(1, 1)[0]?.value.join(",");
      for (const [enemy, mi] of [...b.opponents].sort((x, y) => y[1].tgames - x[1].tgames).slice(0, cfg.maxMatchups)) {
        if (mi.tgames < cfg.minMatchupGames) continue;
        const [start] = mi.starting.top(1, 1);
        matchupItems.push({
          enemy,
          games: mi.tgames,
          // Only a start that differs from the usual one is worth sending.
          starting: start && start.value.join(",") !== usualStart ? { items: start.value, n: start.n } : null,
          first: [...mi.first].map(([itemId, n]) => ({ itemId, n })).sort((x, y) => y.n - x.n).slice(0, cfg.maxOptions),
        });
      }
      matchupItems.sort((x, y) => x.enemy - y.enemy);

      out.push({
        championId: b.championId,
        role: b.role,
        n: b.n,
        timelineN: b.timelineN,
        games: round(b.games),
        wins: round(b.wins),
        pages,
        spells: opt(b.spells.top(cfg.maxOptions, cfg.minOptionGames), (v) => ({ spells: v })),
        skills: opt(b.skills.top(cfg.maxOptions, cfg.minOptionGames), (v) => v),
        starting: opt(b.starting.top(cfg.maxOptions, cfg.minOptionGames), (v) => ({ items: v })),
        core: opt(b.core.top(cfg.maxOptions * 2, cfg.minOptionGames), (v) => ({ items: v })),
        items,
        lifts: lifts.slice(0, maxPerBuild),
        matchupPages,
        matchupItems,
        ...(cfg.spikes ? { spikes: this.spikesOf(b, cfg.spikes) } : {}),
      });
    }
    return out.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role));
  }
}
