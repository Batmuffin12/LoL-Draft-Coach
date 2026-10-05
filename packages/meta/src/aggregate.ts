import { deriveChampionAttributes, halfLifeWeight, readMetric, type AttributeSample } from "@ldc/engine";
import type { ChampionRoleStat, MatchSummary, MetaSnapshot, PairStat, ParticipantSummary, Position, RankBandId } from "@ldc/shared";
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

class PairCounter {
  private readonly map = new Map<string, PairStat>();

  /** Adds one game of the pair; `aWon` is from the first champion's side. Stored once per unordered pair. */
  add(a: ParticipantSummary, b: ParticipantSummary, aWon: boolean, weight: number): void {
    const swap = a.championId > b.championId || (a.championId === b.championId && a.position > b.position);
    const [x, y] = swap ? [b, a] : [a, b];
    const xWon = swap ? !aWon : aWon;
    const key = `${x.championId}|${x.position}|${y.championId}|${y.position}`;
    let s = this.map.get(key);
    if (!s) this.map.set(key, (s = [x.championId, x.position, y.championId, y.position, 0, 0, 0]));
    s[4] += weight;
    if (xWon) s[5] += weight;
    s[6] += 1;
  }

  list(minGames: number): PairStat[] {
    return [...this.map.values()]
      .filter((s) => s[6] >= minGames)
      .map((s): PairStat => [s[0], s[1], s[2], s[3], round(s[4]), round(s[5]), s[6]])
      .sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1].localeCompare(q[1]) || p[3].localeCompare(q[3]));
  }
}

export interface AggregateInput {
  band: RankBandId;
  /** Collected matches of this band (any order). Players' identities are never part of them. */
  matches: MatchSummary[];
  now: number;
  config: AggregationConfig;
  /** Playstyle metric names to publish references for (engine config playstyle axes). */
  metrics: string[];
}

/**
 * Turns a band's collected matches into its meta snapshot. Pure: no I/O.
 * Each game is weighted by recency (half-life), so the meta moves smoothly as players
 * adapt instead of jumping at patch boundaries. Only positioned, non-remake games count.
 */
export function aggregateBand(input: AggregateInput): MetaSnapshot {
  const { config: cfg, now } = input;
  const usable = input.matches.filter(
    (m) =>
      m.endedAt > now - cfg.windowDays * DAY_MS &&
      m.durationSec >= cfg.minDurationSec &&
      m.participants.length > 0 &&
      m.participants.every((p) => p.position),
  );

  const champions = new Map<string, ChampionRoleStat>();
  const roleGames: Record<Position, number> = {};
  const matchups = new PairCounter();
  const duos = new PairCounter();
  const samples: AttributeSample[] = [];
  const metricValues = new Map<Position, Map<string, number[]>>();
  const metrics = [...new Set(input.metrics.map((m) => m.replace(/^-/, "")))];

  for (const m of usable) {
    const w = halfLifeWeight(now - m.endedAt, cfg.halfLifeDays);
    const ps = m.participants;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      const key = `${p.championId}|${p.position}`;
      let c = champions.get(key);
      if (!c) champions.set(key, (c = { championId: p.championId, role: p.position, games: 0, wins: 0, n: 0 }));
      c.games += w;
      if (p.win) c.wins += w;
      c.n++;
      roleGames[p.position] = (roleGames[p.position] ?? 0) + w;

      for (let j = i + 1; j < ps.length; j++) {
        const q = ps[j]!;
        if (q.teamId === p.teamId) duos.add(p, q, p.win, w);
        else matchups.add(p, q, p.win, w);
      }

      samples.push({
        championId: p.championId,
        position: p.position,
        physicalDamage: p.physicalDamage,
        magicDamage: p.magicDamage,
        trueDamage: p.trueDamage,
        damageTaken: p.damageTaken,
        selfMitigated: p.selfMitigated,
        ccSeconds: p.ccSeconds,
        durationSec: m.durationSec,
      });

      let byMetric = metricValues.get(p.position);
      if (!byMetric) metricValues.set(p.position, (byMetric = new Map()));
      for (const metric of metrics) {
        const v = readMetric(p, m.durationSec, metric);
        if (v === null) continue;
        let list = byMetric.get(metric);
        if (!list) byMetric.set(metric, (list = []));
        list.push(v);
      }
    }
  }

  const references: MetaSnapshot["references"] = {};
  for (const [role, byMetric] of metricValues) {
    const out: Record<string, { n: number; quantiles: number[] }> = {};
    for (const [metric, values] of byMetric) {
      if (values.length < cfg.minReferenceSamples) continue;
      out[metric] = { n: values.length, quantiles: quantiles(values.sort((a, b) => a - b), cfg.referenceQuantiles) };
    }
    if (Object.keys(out).length) references[role] = out;
  }

  const attributes = [...deriveChampionAttributes(samples, cfg.minAttributeSamples).values()]
    .map((a) => ({
      ...a,
      physicalShare: round(a.physicalShare),
      magicShare: round(a.magicShare),
      trueShare: round(a.trueShare),
      frontline: round(a.frontline),
      engage: round(a.engage),
      roleShares: Object.fromEntries(Object.entries(a.roleShares).map(([k, v]) => [k, round(v)])),
    }))
    .sort((a, b) => a.championId - b.championId);

  return {
    format: 1,
    band: input.band,
    createdAt: now,
    patch: newestPatch(usable.map((m) => patchOf(m.gameVersion))),
    matches: usable.length,
    newestMatchAt: usable.length ? Math.max(...usable.map((m) => m.endedAt)) : null,
    halfLifeDays: cfg.halfLifeDays,
    roleGames: Object.fromEntries(Object.entries(roleGames).map(([k, v]) => [k, round(v)])),
    champions: [...champions.values()]
      .map((c) => ({ ...c, games: round(c.games), wins: round(c.wins) }))
      .sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role)),
    matchups: matchups.list(cfg.minPairGames),
    duos: duos.list(cfg.minPairGames),
    attributes,
    references,
  };
}

