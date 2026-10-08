import { addAttributeSample, attributesFromTotals, halfLifeWeight, metricImportance, readMetric, type AttributeTotals } from "@ldc/engine";
import type { ChampionAttributes, ChampionId, ChampionRoleStat, MatchSummary, MetaSnapshot, PairStat, ParticipantSummary, Position, RankBandId, TrendingChampion } from "@ldc/shared";
import type { AggregationConfig } from "./config";

const DAY_MS = 86_400_000;
const round = (x: number) => Math.round(x * 1000) / 1000;

/** "major.minor" of a Match-V5 gameVersion such as "15.19.712.1234"; null when it doesn't parse. */
export function patchOf(gameVersion: string): string | null {
  const m = /^(\d+)\.(\d+)/.exec(gameVersion);
  return m ? `${Number(m[1])}.${Number(m[2])}` : null;
}

/** The newest of several "major.minor" patches. */
export function newestPatch(patches: Iterable<string | null>): string | null {
  let best: [number, number] | null = null;
  for (const p of patches) {
    if (!p) continue;
    const [a, b] = p.split(".").map(Number) as [number, number];
    if (!best || a > best[0] || (a === best[0] && b > best[1])) best = [a, b];
  }
  return best ? `${best[0]}.${best[1]}` : null;
}

/** Evenly spaced quantiles of an ascending array (linear interpolation), `count` values from min to max. */
export function quantiles(sorted: number[], count: number): number[] {
  if (!sorted.length) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(sorted.length - 1, lo + 1);
    out.push(round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)));
  }
  return out;
}

/**
 * Counts champion pairs compactly: a numeric key per pair and three growable Float64Arrays
 * (games, wins, n), because a band of 50k games has hundreds of thousands of pairs and the
 * server runs in a 256 MB heap. Positions are interned to small numbers.
 */
class PairCounter {
  private readonly index = new Map<number, number>();
  private readonly positions: string[] = [];
  private readonly positionIds = new Map<string, number>();
  private games = new Float64Array(1024);
  private wins = new Float64Array(1024);
  private counts = new Float64Array(1024);
  private keys = new Float64Array(1024);
  private size = 0;

  private pos(p: string): number {
    let id = this.positionIds.get(p);
    if (id === undefined) {
      id = this.positions.length;
      this.positions.push(p);
      this.positionIds.set(p, id);
    }
    return id;
  }

  private static readonly P = 64;
  private static readonly C = 1 << 16;

  /** Adds one game of the pair; `aWon` is from the first champion's side. Stored once per unordered pair. */
  add(a: ParticipantSummary, b: ParticipantSummary, aWon: boolean, weight: number): void {
    const swap = a.championId > b.championId || (a.championId === b.championId && a.position > b.position);
    const [x, y] = swap ? [b, a] : [a, b];
    const xWon = swap ? !aWon : aWon;
    const { P, C } = PairCounter;
    const key = ((x.championId * P + this.pos(x.position)) * C + y.championId) * P + this.pos(y.position);
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.size++;
      if (i >= this.games.length) {
        const grow = (arr: Float64Array) => {
          const next = new Float64Array(arr.length * 2);
          next.set(arr);
          return next;
        };
        this.games = grow(this.games);
        this.wins = grow(this.wins);
        this.counts = grow(this.counts);
        this.keys = grow(this.keys);
      }
      this.keys[i] = key;
      this.index.set(key, i);
    }
    this.games[i]! += weight;
    if (xWon) this.wins[i]! += weight;
    this.counts[i]! += 1;
  }

  list(minGames: number): PairStat[] {
    const { P, C } = PairCounter;
    const out: PairStat[] = [];
    for (let i = 0; i < this.size; i++) {
      if (this.counts[i]! < minGames) continue;
      let k = this.keys[i]!;
      const yr = k % P;
      k = (k - yr) / P;
      const yc = k % C;
      k = (k - yc) / C;
      const xr = k % P;
      const xc = (k - xr) / P;
      out.push([xc, this.positions[xr]!, yc, this.positions[yr]!, round(this.games[i]!), round(this.wins[i]!), this.counts[i]!]);
    }
    return out.sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1].localeCompare(q[1]) || p[3].localeCompare(q[3]));
  }
}

export interface AggregatorOptions {
  band: RankBandId;
  now: number;
  config: AggregationConfig;
  /** Playstyle metric names to publish references for (engine config playstyle axes; a leading "-" is ignored). */
  metrics: string[];
}

/**
 * Streams a band's collected matches into its meta snapshot. Pure: no I/O; feed it
 * matches newest first so playstyle references (capped at referenceMaxSamples per
 * role and metric) describe the current game.
 *
 * Each game is weighted by recency (half-life), so the meta moves smoothly as players
 * adapt instead of jumping at patch boundaries. Only positioned, non-remake games
 * inside the window count. Matches carry no player identities.
 */
export class BandAggregator {
  private readonly champions = new Map<string, ChampionRoleStat>();
  private readonly roleGames: Record<Position, number> = {};
  private readonly matchups = new PairCounter();
  private readonly duos = new PairCounter();
  private readonly attributes = new Map<ChampionId, AttributeTotals>();
  private readonly metricValues = new Map<Position, Map<string, number[]>>();
  /** Whether each sampled player won, parallel to metricValues (for importance). */
  private readonly metricWins = new Map<Position, Map<string, boolean[]>>();
  private readonly metrics: string[];
  private readonly patches = new Set<string | null>();
  private count = 0;
  private readonly bans = new Map<ChampionId, { bans: number; n: number }>();
  /** Weighted games that carried ban data (older stored games didn't). */
  private banMatches = 0;
  /** Unweighted counts for trends: recent days vs the rest of the window. */
  private readonly trendCounts = new Map<string, { championId: ChampionId; role: Position; rN: number; rW: number; bN: number; bW: number }>();
  private recentMatches = 0;
  private readonly powerCurves = new Map<ChampionId, { early: { n: number; w: number }; late: { n: number; w: number } }>();
  /** Gold lead over the lane opponent at minute 15, per champion (timelines only). */
  private readonly gold15 = new Map<ChampionId, { n: number; sum: number }>();
  private beforeMatches = 0;
  private newest: number | null = null;

  constructor(private readonly opts: AggregatorOptions) {
    this.metrics = [...new Set(opts.metrics.map((m) => m.replace(/^-/, "")))];
  }

  /** Whether a match counts at all (inside the window, not a remake, every player positioned). */
  usable(m: MatchSummary): boolean {
    const cfg = this.opts.config;
    return (
      m.endedAt > this.opts.now - cfg.windowDays * DAY_MS &&
      m.durationSec >= cfg.minDurationSec &&
      m.participants.length > 0 &&
      m.participants.every((p) => p.position)
    );
  }

  /** Adds one match; returns false when it was skipped. */
  add(m: MatchSummary): boolean {
    if (!this.usable(m)) return false;
    const cfg = this.opts.config;
    const w = halfLifeWeight(this.opts.now - m.endedAt, cfg.halfLifeDays);
    this.count++;
    this.newest = Math.max(this.newest ?? 0, m.endedAt);
    this.patches.add(patchOf(m.gameVersion));
    const recent = this.opts.now - m.endedAt < cfg.trend.recentDays * DAY_MS;
    if (recent) this.recentMatches++;
    else this.beforeMatches++;
    for (const p of m.participants) {
      const key = `${p.championId}|${p.position}`;
      let t = this.trendCounts.get(key);
      if (!t) this.trendCounts.set(key, (t = { championId: p.championId, role: p.position, rN: 0, rW: 0, bN: 0, bW: 0 }));
      if (recent) {
        t.rN++;
        if (p.win) t.rW++;
      } else {
        t.bN++;
        if (p.win) t.bW++;
      }
    }
    if (m.bans) {
      this.banMatches += w;
      // A champion counts once per game, even if both teams list it.
      for (const id of new Set(m.bans.map((b) => b.championId))) {
        const b = this.bans.get(id) ?? { bans: 0, n: 0 };
        b.bans += w;
        b.n++;
        this.bans.set(id, b);
      }
    }
    const ps = m.participants;
    const gold = m.timeline?.gold;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      const opp = gold ? ps.findIndex((q) => q.teamId !== p.teamId && q.position === p.position) : -1;
      const g15 = gold?.[i]?.[15];
      const o15 = opp >= 0 ? gold?.[opp]?.[15] : undefined;
      if (g15 !== undefined && o15 !== undefined) {
        const s = this.gold15.get(p.championId) ?? { n: 0, sum: 0 };
        s.n++;
        s.sum += g15 - o15;
        this.gold15.set(p.championId, s);
      }
      const key = `${p.championId}|${p.position}`;
      let c = this.champions.get(key);
      if (!c) this.champions.set(key, (c = { championId: p.championId, role: p.position, games: 0, wins: 0, n: 0 }));
      c.games += w;
      if (p.win) c.wins += w;
      c.n++;
      this.roleGames[p.position] = (this.roleGames[p.position] ?? 0) + w;

      for (let j = i + 1; j < ps.length; j++) {
        const q = ps[j]!;
        if (q.teamId === p.teamId) this.duos.add(p, q, p.win, w);
        else this.matchups.add(p, q, p.win, w);
      }

      addAttributeSample(this.attributes, {
        championId: p.championId,
        position: p.position,
        physicalDamage: p.physicalDamage,
        magicDamage: p.magicDamage,
        trueDamage: p.trueDamage,
        damageTaken: p.damageTaken,
        selfMitigated: p.selfMitigated,
        ccSeconds: p.ccSeconds,
        ...(p.heal !== undefined ? { heal: p.heal } : {}),
        durationSec: m.durationSec,
      });

      // Power curve: results in short vs long games.
      const minutes = m.durationSec / 60;
      const phase = minutes < cfg.powerCurve.earlyMinutes ? "early" : minutes > cfg.powerCurve.lateMinutes ? "late" : null;
      if (phase) {
        let pc = this.powerCurves.get(p.championId);
        if (!pc) this.powerCurves.set(p.championId, (pc = { early: { n: 0, w: 0 }, late: { n: 0, w: 0 } }));
        pc[phase].n++;
        if (p.win) pc[phase].w++;
      }

      let byMetric = this.metricValues.get(p.position);
      if (!byMetric) this.metricValues.set(p.position, (byMetric = new Map()));
      let winsByMetric = this.metricWins.get(p.position);
      if (!winsByMetric) this.metricWins.set(p.position, (winsByMetric = new Map()));
      for (const metric of this.metrics) {
        let list = byMetric.get(metric);
        if (list && list.length >= cfg.referenceMaxSamples) continue;
        const v = readMetric(p, m.durationSec, metric, m);
        if (v === null) continue;
        if (!list) byMetric.set(metric, (list = []));
        list.push(v);
        let wins = winsByMetric.get(metric);
        if (!wins) winsByMetric.set(metric, (wins = []));
        wins.push(p.win);
      }
    }
    return true;
  }

  /**
   * Champion-roles rising fast: a pick rate well above before, and/or a win-rate rise that
   * is both large and clear of noise (a two-proportion z-test). Both periods need enough games.
   */
  private trending(): TrendingChampion[] {
    const t = this.opts.config.trend;
    if (!this.recentMatches || !this.beforeMatches) return [];
    const out: TrendingChampion[] = [];
    for (const c of this.trendCounts.values()) {
      if (c.rN < t.minGames || c.bN < t.minGames) continue;
      const pick = { before: c.bN / this.beforeMatches, recent: c.rN / this.recentMatches };
      const win = { before: c.bW / c.bN, recent: c.rW / c.rN };
      // Both rises must be clear of sampling noise (two-proportion z-test), not just large.
      const z = (k1: number, n1: number, k2: number, n2: number) => {
        const p = (k1 + k2) / (n1 + n2);
        const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
        return se > 0 ? (k1 / n1 - k2 / n2) / se : 0;
      };
      const pickRising =
        pick.recent >= t.minPickRate && pick.recent >= t.pickRateFactor * pick.before && z(c.rN, this.recentMatches, c.bN, this.beforeMatches) >= t.minZ;
      const winRising = win.recent - win.before >= t.minWinRateRise && z(c.rW, c.rN, c.bW, c.bN) >= t.minZ;
      if (!pickRising && !winRising) continue;
      out.push({
        championId: c.championId,
        role: c.role,
        rising: pickRising && winRising ? "both" : pickRising ? "pick" : "win",
        pickRate: { before: round(pick.before), recent: round(pick.recent) },
        winRate: { before: round(win.before), recent: round(win.recent) },
        games: { before: c.bN, recent: c.rN },
      });
    }
    return out.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role));
  }

  private powerCurveOf(id: ChampionId): Pick<ChampionAttributes, "powerCurve"> {
    const pc = this.powerCurves.get(id);
    const g = this.gold15.get(id);
    if (!pc && !g) return {};
    const side = (s: { n: number; w: number }) => ({ games: s.n, winRate: s.n ? round(s.w / s.n) : 0 });
    const none = { n: 0, w: 0 };
    return {
      powerCurve: {
        early: side(pc?.early ?? none),
        late: side(pc?.late ?? none),
        ...(g ? { goldAt15: { games: g.n, diff: Math.round(g.sum / g.n) } } : {}),
      },
    };
  }

  finish(): MetaSnapshot {
    const cfg = this.opts.config;
    const references: MetaSnapshot["references"] = {};
    for (const [role, byMetric] of this.metricValues) {
      const out: Record<string, { n: number; quantiles: number[]; importance: number }> = {};
      for (const [metric, values] of byMetric) {
        if (values.length < cfg.minReferenceSamples) continue;
        const wins = this.metricWins.get(role)?.get(metric) ?? [];
        out[metric] = {
          n: values.length,
          quantiles: quantiles([...values].sort((a, b) => a - b), cfg.referenceQuantiles),
          // How strongly the metric separates wins from losses in this role (growth focus).
          importance: round(metricImportance(values.map((value, i) => ({ value, win: wins[i] ?? false })))),
        };
      }
      if (Object.keys(out).length) references[role] = out;
    }

    const attributes = [...attributesFromTotals(this.attributes.values(), cfg.minAttributeSamples).values()]
      .map((a) => ({
        ...a,
        physicalShare: round(a.physicalShare),
        magicShare: round(a.magicShare),
        trueShare: round(a.trueShare),
        frontline: round(a.frontline),
        engage: round(a.engage),
        ...(a.heal !== undefined ? { heal: round(a.heal) } : {}),
        roleShares: Object.fromEntries(Object.entries(a.roleShares).map(([k, v]) => [k, round(v)])),
        ...this.powerCurveOf(a.championId),
      }))
      .sort((a, b) => a.championId - b.championId);

    return {
      format: 1,
      band: this.opts.band,
      createdAt: this.opts.now,
      patch: newestPatch(this.patches),
      matches: this.count,
      newestMatchAt: this.newest,
      halfLifeDays: cfg.halfLifeDays,
      roleGames: Object.fromEntries(Object.entries(this.roleGames).map(([k, v]) => [k, round(v)])),
      trending: this.trending(),
      banMatches: round(this.banMatches),
      bans: [...this.bans]
        .map(([championId, b]) => ({ championId, bans: round(b.bans), n: b.n }))
        .sort((a, b) => a.championId - b.championId),
      champions: [...this.champions.values()]
        .map((c) => ({ ...c, games: round(c.games), wins: round(c.wins) }))
        .sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role)),
      matchups: this.matchups.list(cfg.minPairGames),
      duos: this.duos.list(cfg.minPairGames),
      attributes,
      references,
    };
  }
}

/** Aggregates a list of matches in one go (sorted newest first internally). */
export function aggregateBand(input: AggregatorOptions & { matches: MatchSummary[] }): MetaSnapshot {
  const agg = new BandAggregator(input);
  for (const m of [...input.matches].sort((a, b) => b.endedAt - a.endedAt)) agg.add(m);
  return agg.finish();
}
