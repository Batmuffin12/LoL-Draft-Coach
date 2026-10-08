import type { ChampionId, MatchSummary, MatchTimeline, Position } from "@ldc/shared";
import { completedPurchases } from "./builds";
import type { MetaConfig } from "./config";

export type SpikeConfig = MetaConfig["spikes"];

/** A spike moment: the k-th completed item (1-based), or reaching a champion level. */
export type SpikeEvent = { kind: "item"; slot: number } | { kind: "level"; level: number };

/**
 * One measured spike: how much faster a champion gains on its lane opponent right after the
 * event than right before it, beyond what its role usually gains at the same event.
 */
export interface SpikeStat {
  kind: "item" | "level";
  /** The item slot (1 = first completed item) or the level. */
  at: number;
  /** Games behind the gold measure. */
  n: number;
  /** Mean minute the event happens. */
  minute: number;
  /** Gold-lead swing over the lane opponent (after window minus before window) beyond the role's, shrunk toward 0. */
  gold: number;
  /** The unshrunk swing in standard errors (sign = direction). */
  goldZ: number;
  /** The same for fights won (takedowns minus deaths), from timelines with kill events. */
  fights?: number;
  fightsZ?: number;
  fightsN?: number;
}

export interface ChampionSpikes {
  championId: ChampionId;
  role: Position;
  spikes: SpikeStat[];
}

export interface SpikeOptions {
  now: number;
  config: SpikeConfig;
  /** Games shorter than this are remakes; older ones than windowDays are left out (aggregation config). */
  minDurationSec: number;
  windowDays: number;
  /** Completed items (Data Dragon with the engine's item rules). */
  completed: ReadonlySet<number>;
}

interface Acc {
  n: number;
  sum: number;
  sq: number;
  fn: number;
  fsum: number;
  fsq: number;
  minutes: number;
}
const acc = (): Acc => ({ n: 0, sum: 0, sq: 0, fn: 0, fsum: 0, fsq: 0, minutes: 0 });
const DAY_MS = 86_400_000;

/**
 * Measures power spikes from collected timelines (docs/ENGINE-PLAN.md): for each player and
 * spike event (each of the first `itemSlots` completed items, each level), the gold lead over
 * the lane opponent gained in the `windowMinutes` after the event minus the same span before
 * it, and the same for fights won when kill events are stored. A champion's spike is its mean
 * minus its role's mean at that event (so "everyone gets stronger with items" cancels), shrunk
 * toward 0 with `priorGames`. Pools whatever matches it's given (all rank bands). Pure.
 */
export class SpikeAggregator {
  private readonly byChampion = new Map<string, Acc>();
  private readonly byRole = new Map<string, Acc>();
  private games = 0;

  constructor(private readonly opts: SpikeOptions) {}

  add(m: MatchSummary): boolean {
    const t = m.timeline;
    const o = this.opts;
    if (!t?.gold.length || m.durationSec < o.minDurationSec || m.endedAt <= o.now - o.windowDays * DAY_MS) return false;
    if (!m.participants.every((p) => p.position)) return false;
    this.games++;
    m.participants.forEach((p, i) => {
      const opp = m.participants.findIndex((q, j) => j !== i && q.position === p.position && q.win !== p.win);
      if (opp < 0) return;
      for (const [event, sec] of this.events(t, i)) this.measure(t, i, opp, p.championId, p.position, event, sec);
    });
    return true;
  }

  /** The player's spike events with the second each happened. */
  private events(t: MatchTimeline, i: number): [SpikeEvent, number][] {
    const out: [SpikeEvent, number][] = completedPurchases(t, i, this.opts.completed)
      .slice(0, this.opts.config.itemSlots)
      .map((x, k) => [{ kind: "item", slot: k + 1 }, x.sec]);
    const levels = t.levels?.[i];
    if (levels) {
      // Frame f is minute f: a level first shown at frame f was reached during minute f − 1.
      let reached = levels[0] ?? 1;
      for (let f = 1; f < levels.length; f++) {
        for (let l = reached + 1; l <= levels[f]!; l++) out.push([{ kind: "level", level: l }, (f - 1) * 60 + 30]);
        reached = Math.max(reached, levels[f]!);
      }
    }
    return out;
  }

  private measure(t: MatchTimeline, i: number, opp: number, championId: ChampionId, role: Position, event: SpikeEvent, sec: number): void {
    const w = this.opts.config.windowMinutes;
    const a = Math.floor(sec / 60);
    const b = a + 1;
    const gi = t.gold[i]!;
    const go = t.gold[opp]!;
    if (a - w < 0 || b + w >= gi.length || b + w >= go.length) return;
    const lead = (f: number) => gi[f]! - go[f]!;
    const gold = lead(b + w) - lead(b) - (lead(a) - lead(a - w));

    let fights: number | null = null;
    if (t.kills) {
      const net = (from: number, to: number) => {
        let n = 0;
        for (const [s, killer, victim, assists] of t.kills!) {
          if (s < from * 60 || s >= to * 60) continue;
          if (killer === i || (assists & (1 << i)) !== 0) n++;
          if (victim === i) n--;
        }
        return n;
      };
      fights = net(b, b + w) - net(a - w, a);
    }

    const key = event.kind === "item" ? `item:${event.slot}` : `level:${event.level}`;
    for (const [map, k] of [
      [this.byChampion, `${championId}|${role}|${key}`],
      [this.byRole, `${role}|${key}`],
    ] as const) {
      const x = map.get(k) ?? map.set(k, acc()).get(k)!;
      x.n++;
      x.sum += gold;
      x.sq += gold * gold;
      x.minutes += sec / 60;
      if (fights !== null) {
        x.fn++;
        x.fsum += fights;
        x.fsq += fights * fights;
      }
    }
  }

  /** Matches with a usable timeline. */
  get matches(): number {
    return this.games;
  }

  /** Spikes per champion-role with at least `minGames` games, by event; every measured event, unfiltered by z. */
  finish(): ChampionSpikes[] {
    const cfg = this.opts.config;
    const out = new Map<string, ChampionSpikes>();
    for (const [k, x] of this.byChampion) {
      if (x.n < cfg.minGames) continue;
      const [id, role, kind, at] = k.split(/[|:]/) as [string, Position, "item" | "level", string];
      const r = this.byRole.get(`${role}|${kind}:${at}`)!;
      const stat = (n: number, sum: number, sq: number, rn: number, rsum: number) => {
        const mean = sum / n;
        const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
        const rel = mean - rsum / rn;
        return { shrunk: (rel * n) / (n + cfg.priorGames), z: sd > 0 ? rel / (sd / Math.sqrt(n)) : 0 };
      };
      const g = stat(x.n, x.sum, x.sq, r.n, r.sum);
      const s: SpikeStat = { kind, at: Number(at), n: x.n, minute: round(x.minutes / x.n, 1), gold: Math.round(g.shrunk), goldZ: round(g.z, 2) };
      if (x.fn >= cfg.minGames && r.fn > 0) {
        const f = stat(x.fn, x.fsum, x.fsq, r.fn, r.fsum);
        Object.assign(s, { fights: round(f.shrunk, 3), fightsZ: round(f.z, 2), fightsN: x.fn });
      }
      const ck = `${id}|${role}`;
      const c = out.get(ck) ?? out.set(ck, { championId: Number(id), role, spikes: [] }).get(ck)!;
      c.spikes.push(s);
    }
    for (const c of out.values()) c.spikes.sort((a, b) => (a.kind === b.kind ? a.at - b.at : a.kind === "item" ? -1 : 1));
    return [...out.values()].sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role));
  }
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
