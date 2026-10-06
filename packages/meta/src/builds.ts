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

class OptionCounter<T> {
  private readonly map = new Map<string, Opt<T>>();

  add(key: string, value: T, w: number, won: boolean): void {
    let o = this.map.get(key);
    if (!o) this.map.set(key, (o = { value, games: 0, wins: 0, n: 0 }));
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
  /** Purchases per state bin, to subtract the expected win of the state they were made in. */
  bins: Map<number, number>;
}

/** Per trait: [games with the trait low, games with it high]. */
type TraitCounts = Record<EnemyTrait, [number, number]>;
const emptyTraits = (): TraitCounts => Object.fromEntries(ENEMY_TRAITS.map((t) => [t, [0, 0]])) as unknown as TraitCounts;

class BuildAcc {
  n = 0;
  timelineN = 0;
  games = 0;
  wins = 0;
  readonly pages = new OptionCounter<Omit<RunePageStat, keyof OptionStat>>();
  readonly spells = new OptionCounter<number[]>();
  readonly skills = new OptionCounter<{ first: number[]; order: number[] }>();
  readonly starting = new OptionCounter<number[]>();
  readonly core = new OptionCounter<number[]>();
  readonly slots = new Map<string, SlotAcc>();
  /** Games that reached each completed-item slot. */
  readonly slotGames: number[] = [];
  readonly traitGames = emptyTraits();
  /** "rune:id" / "item:id" → games taken per trait side. */
  readonly takes = new Map<string, TraitCounts>();
  readonly matchups = new Map<ChampionId, OptionCounter<Omit<RunePageStat, keyof OptionStat>>>();

  constructor(
    readonly championId: ChampionId,
    readonly role: Position,
  ) {}
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
  /** Measured champion attributes (the band's), for enemy-team traits. */
  attributes: ReadonlyMap<ChampionId, ChampionAttributes>;
  /** Band-average trait values: above, a trait counts as high. */
  traitCuts: Record<EnemyTrait, number>;
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
  /** Expected-win state bins over every team-minute of every timeline: [games, wins]. */
  private readonly stateN: number[];
  private readonly stateW: number[];
  private readonly goldBuckets: number;

  constructor(private readonly opts: BuildAggregatorOptions) {
    const { minutes, goldDiff } = opts.config.stateBins;
    this.goldBuckets = goldDiff.length + 1;
    this.stateN = new Array((minutes.length + 1) * this.goldBuckets).fill(0);
    this.stateW = new Array((minutes.length + 1) * this.goldBuckets).fill(0);
  }

  private bin(minute: number, goldDiff: number): number {
    const { minutes, goldDiff: g } = this.opts.config.stateBins;
    return bucket(minutes, minute) * this.goldBuckets + bucket(g, goldDiff);
  }

  private acc(p: ParticipantSummary): BuildAcc {
    const key = `${p.championId}|${p.position}`;
    let b = this.builds.get(key);
    if (!b) this.builds.set(key, (b = new BuildAcc(p.championId, p.position)));
    return b;
  }

  add(m: MatchSummary): boolean {
    const o = this.opts;
    if (m.endedAt <= o.now - o.windowDays * DAY_MS || m.durationSec < o.minDurationSec || !m.participants.length || !m.participants.every((p) => p.position)) return false;
    const w = halfLifeWeight(o.now - m.endedAt, o.halfLifeDays);
    const t = m.timeline;
    const cfg = o.config;
    const ps = m.participants;

    // Team gold per frame, for the state bins.
    const teamGold = new Map<number, number[]>();
    if (t) {
      ps.forEach((p, i) => {
        const g = teamGold.get(p.teamId) ?? [];
        (t.gold[i] ?? []).forEach((v, f) => (g[f] = (g[f] ?? 0) + v));
        teamGold.set(p.teamId, g);
      });
      const teams = [...teamGold.keys()];
      if (teams.length === 2) {
        for (const team of teams) {
          const mine = teamGold.get(team)!;
          const theirs = teamGold.get(teams.find((x) => x !== team)!)!;
          const won = ps.find((p) => p.teamId === team)!.win;
          for (let f = 1; f < Math.min(mine.length, theirs.length); f++) {
            const b = this.bin(f, mine[f]! - theirs[f]!);
            this.stateN[b]!++;
            if (won) this.stateW[b]!++;
          }
        }
      }
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
        b.traitGames[tr][side]++;
      }
      const take = (key: string) => {
        let c = b.takes.get(key);
        if (!c) b.takes.set(key, (c = emptyTraits()));
        for (const [tr, side] of sides) c[tr][side]++;
      };

      if (p.perks && p.perks.runes.length) {
        const page = { primaryStyle: p.perks.primaryStyle, subStyle: p.perks.subStyle, runes: p.perks.runes, statPerks: p.perks.statPerks };
        b.pages.add(pageKey(p.perks), page, w, p.win);
        for (const r of new Set(p.perks.runes)) take(`rune:${r}`);
        const opp = enemies.find((q) => q.position === p.position);
        if (opp) {
          let mc = b.matchups.get(opp.championId);
          if (!mc) b.matchups.set(opp.championId, (mc = new OptionCounter()));
          mc.add(pageKey(p.perks), page, w, p.win);
        }
      }
      const spells = p.spells.filter((s) => s > 0).sort((x, y) => x - y);
      if (spells.length === 2) b.spells.add(spells.join(","), spells, w, p.win);

      if (!t) {
        // Without a timeline, the end-of-game inventory says which completed items were taken.
        for (const id of new Set(p.items.filter((x) => o.completed.has(x)))) take(`item:${id}`);
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
      for (const it of new Set(bought.map((x) => x.itemId))) take(`item:${it}`);
      if (bought.length >= 2) {
        const path = bought.slice(0, cfg.coreItems).map((x) => x.itemId);
        b.core.add(path.join(","), path, w, p.win);
        if (path.length > 2) b.core.add(path.slice(0, 2).join(","), path.slice(0, 2), w, p.win);
      }
      bought.slice(0, cfg.maxSlots).forEach((x, k) => {
        b.slotGames[k] = (b.slotGames[k] ?? 0) + 1;
        const key = `${x.itemId}|${k + 1}`;
        let s = b.slots.get(key);
        if (!s) b.slots.set(key, (s = { n: 0, wins: 0, minutes: 0, bins: new Map() }));
        s.n++;
        if (p.win) s.wins++;
        s.minutes += x.sec / 60;
        const bin = this.bin(Math.floor(x.sec / 60), goldDiffAt(p.teamId, x.sec));
        s.bins.set(bin, (s.bins.get(bin) ?? 0) + 1);
      });
    });
    return true;
  }

  /** Smoothed expected win per state bin. */
  private expected(): number[] {
    const k = this.opts.config.stateBins.priorGames;
    return this.stateN.map((n, b) => (this.stateW[b]! + 0.5 * k) / (n + k));
  }

  expectedWinTable(): ExpectedWinTable {
    const e = this.expected();
    const rows: number[][] = [];
    for (let i = 0; i < e.length; i += this.goldBuckets) rows.push(e.slice(i, i + this.goldBuckets).map((x) => round(x)));
    return {
      minutes: this.opts.config.stateBins.minutes,
      goldDiff: this.opts.config.stateBins.goldDiff,
      winRate: rows,
      n: this.stateN.reduce((a, b) => a + b, 0),
    };
  }

  finish(): ChampionBuild[] {
    const cfg = this.opts.config;
    const e = this.expected();
    const out: ChampionBuild[] = [];
    for (const b of this.builds.values()) {
      if (b.n < cfg.minGames) continue;
      const opt = <T, R>(list: Opt<T>[], f: (v: T) => R) =>
        list.map((x) => ({ ...f(x.value), games: round(x.games), wins: round(x.wins), n: x.n }));

      const items: ItemSlotStat[] = [];
      for (const [key, s] of b.slots) {
        if (s.n < cfg.minItemGames) continue;
        const [itemId, slot] = key.split("|").map(Number) as [number, number];
        let expectedWins = 0;
        for (const [bin, c] of s.bins) expectedWins += c * e[bin]!;
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

      const lifts: SituationalLift[] = [];
      const { priorGames: k, minGames, minLift, maxPerBuild } = cfg.lift;
      for (const [key, c] of b.takes) {
        const [kind, id] = key.split(":") as ["rune" | "item", string];
        for (const tr of ENEMY_TRAITS) {
          const [nLow, nHigh] = b.traitGames[tr];
          const [cLow, cHigh] = c[tr];
          if (nLow < minGames || nHigh < minGames || cLow + cHigh < minGames) continue;
          const base = (cLow + cHigh) / (nLow + nHigh);
          const high = (cHigh + k * base) / (nHigh + k);
          const low = (cLow + k * base) / (nLow + k);
          const lift = low > 0 ? high / low : 0;
          if (lift >= minLift) lifts.push({ kind, id: Number(id), trait: tr, lift: round(lift, 2), high: round(high), low: round(low), n: nLow + nHigh });
        }
      }
      lifts.sort((x, y) => y.lift - x.lift);

      const matchupPages: ChampionBuild["matchupPages"] = [];
      for (const [enemy, counter] of b.matchups) {
        const [best] = counter.top(1, cfg.minMatchupGames);
        if (best) matchupPages.push({ enemy, ...best.value, games: round(best.games), wins: round(best.wins), n: best.n });
      }
      matchupPages.sort((x, y) => x.enemy - y.enemy);

      out.push({
        championId: b.championId,
        role: b.role,
        n: b.n,
        timelineN: b.timelineN,
        games: round(b.games),
        wins: round(b.wins),
        pages: opt(b.pages.top(cfg.maxOptions, cfg.minOptionGames), (v) => v),
        spells: opt(b.spells.top(cfg.maxOptions, cfg.minOptionGames), (v) => ({ spells: v })),
        skills: opt(b.skills.top(cfg.maxOptions, cfg.minOptionGames), (v) => v),
        starting: opt(b.starting.top(cfg.maxOptions, cfg.minOptionGames), (v) => ({ items: v })),
        core: opt(b.core.top(cfg.maxOptions * 2, cfg.minOptionGames), (v) => ({ items: v })),
        items,
        lifts: lifts.slice(0, maxPerBuild),
        matchupPages,
      });
    }
    return out.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role));
  }
}
