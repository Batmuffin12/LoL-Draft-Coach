import type { MatchSummary, ParticipantSummary, Position, UserMatch } from "@ldc/shared";
import { halfLifeWeight } from "./comfort";
import type { EngineConfig } from "./config";

export type PlaystyleConfig = EngineConfig["playstyle"];

/**
 * Reads one metric from a participant. Names are Riot's: "challenges.<field>" reads a
 * Match-V5 challenges value; a few per-minute values are derived from the summary.
 * Returns null when the game doesn't carry the metric (fields vary by patch and role).
 * With the match, metrics from its timeline: "laneGoldDiffAt14" (gold minus the lane opponent's
 * at minute 14; null without a timeline or a single opponent in the same position).
 */
export function readMetric(p: ParticipantSummary, durationSec: number, metric: string, match?: Pick<MatchSummary, "participants" | "timeline">): number | null {
  const minutes = Math.max(1, durationSec / 60);
  if (metric.startsWith("challenges.")) {
    const v = p.challenges[metric.slice("challenges.".length)];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  switch (metric) {
    case "csPerMinute":
      return p.cs / minutes;
    case "deathsPerMinute":
      return p.deaths / minutes;
    case "killsPerMinute":
      return p.kills / minutes;
    case "ccPerMinute":
      return p.ccSeconds / minutes;
    case "objectiveDamagePerMinute":
      return p.objectiveDamage / minutes;
    case "visionScorePerMinute":
      return p.visionScore / minutes;
    case "earlyDeaths":
      return p.earlyDeaths ?? null;
    case "laneGoldDiffAt14":
      return laneGoldDiff(p, match, 14);
    default:
      return null;
  }
}

/** Gold minus the lane opponent's (the one enemy in the same position) at `minute`, from the timeline. */
function laneGoldDiff(p: ParticipantSummary, match: Pick<MatchSummary, "participants" | "timeline"> | undefined, minute: number): number | null {
  const gold = match?.timeline?.gold;
  if (!gold || !p.position) return null;
  const me = match.participants.indexOf(p);
  const opponents = match.participants.flatMap((o, i) => (o.teamId !== p.teamId && o.position === p.position ? [i] : []));
  if (me < 0 || opponents.length !== 1) return null;
  const mine = gold[me]?.[minute];
  const theirs = gold[opponents[0]!]?.[minute];
  return mine === undefined || theirs === undefined ? null : mine - theirs;
}

/** Share of `sorted` below v, counting ties as half (0..1). */
export function empiricalPercentile(v: number, sorted: number[]): number {
  if (!sorted.length) return 0.5;
  let below = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < v) below++;
    else if (x === v) equal++;
    else break;
  }
  return (below + equal / 2) / sorted.length;
}

/**
 * Percentile (0..1) of v against evenly spaced quantiles (min … max), interpolated.
 * Where several quantiles equal v (a common value), the middle of that run is used.
 */
export function percentileFromQuantiles(v: number, q: number[]): number {
  const last = q.length - 1;
  if (last < 1) return 0.5;
  if (v < q[0]!) return 0;
  if (v > q[last]!) return 1;
  let lo = -1;
  let hi = -1;
  for (let i = 0; i <= last; i++) {
    if (q[i] === v) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }
  if (lo >= 0) return (lo + hi) / 2 / last;
  let i = 0;
  while (q[i + 1]! < v) i++;
  return (i + (v - q[i]!) / (q[i + 1]! - q[i]!)) / last;
}

/** A band reference for one metric (from the meta snapshot). */
export interface MetricReference {
  n: number;
  quantiles: number[];
}

const median = (sorted: number[]) =>
  sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2) : 0;

export interface MetricResult {
  /** Metric name as configured, without the "-" (lower-is-better) marker. */
  metric: string;
  lowerIsBetter: boolean;
  /** The player's recency-weighted average. */
  you: number;
  /** Median of the reference players. */
  reference: number;
  /** The player's average percentile against the reference (0..1, higher = better). */
  percentile: number;
  games: number;
}

export interface PlaystyleAxis {
  axis: string;
  /** 0..1: the player's average percentile on this axis's metrics. */
  score: number;
  /** Games in the role that carried enough of this axis's metrics. */
  games: number;
  metrics: MetricResult[];
}

export interface Playstyle {
  role: Position;
  /** The player's games in this role. */
  games: number;
  /** Reference players behind the percentiles (others in this role in the player's games). */
  referenceSamples: number;
  /** "band": percentiles against everyone in the role and rank band (live meta); "games": against others in the player's own games. */
  reference: "band" | "games";
  axes: PlaystyleAxis[];
}

/**
 * The player's playstyle in one role, as named axes. Every metric is a percentile of
 * the player's game against a reference: the other players in the same role in the
 * player's own matches (their lane opponents, so the same rank and patches). Anonymous
 * aggregates only; nobody else is identified. Returns null below the configured
 * minimum number of games or reference samples ("not enough data").
 */
export function computePlaystyle(
  matches: UserMatch[],
  role: Position,
  now: number,
  cfg: PlaystyleConfig,
  bandReferences?: Record<string, MetricReference>,
): Playstyle | null {
  const mine = matches.filter((m) => m.match.participants[m.me]?.position === role);
  if (!role || mine.length < cfg.minGamesPerRole) return null;

  const refs = matches.flatMap((m) =>
    m.match.participants.filter((p, i) => i !== m.me && p.position === role).map((p) => ({ p, durationSec: m.match.durationSec, match: m.match })),
  );
  const band = Object.fromEntries(Object.entries(bandReferences ?? {}).filter(([, r]) => r.n >= cfg.minReferenceSamples && r.quantiles.length > 1));
  const useBand = Object.keys(band).length > 0;
  if (!useBand && refs.length < cfg.minReferenceSamples) return null;

  const referenceSorted = new Map<string, number[]>();
  const refValues = (metric: string) => {
    let v = referenceSorted.get(metric);
    if (!v) {
      v = refs.map((r) => readMetric(r.p, r.durationSec, metric, r.match)).filter((x): x is number => x !== null).sort((a, b) => a - b);
      referenceSorted.set(metric, v);
    }
    return v;
  };

  const axes: PlaystyleAxis[] = [];
  for (const [axis, def] of Object.entries(cfg.axes)) {
    const metrics: MetricResult[] = [];
    // Per game, the axis value is the mean percentile of the metrics that game has.
    const perGame = new Map<UserMatch, number[]>();
    for (const raw of def.metrics) {
      const lowerIsBetter = raw.startsWith("-");
      const metric = lowerIsBetter ? raw.slice(1) : raw;
      const bandRef = useBand ? band[metric] : undefined;
      const ref = bandRef ? [] : refValues(metric);
      if (!bandRef && ref.length < cfg.minReferenceSamples) continue;
      const pctOf = (v: number) => (bandRef ? percentileFromQuantiles(v, bandRef.quantiles) : empiricalPercentile(v, ref));
      let wSum = 0;
      let youSum = 0;
      let pctSum = 0;
      let n = 0;
      for (const m of mine) {
        const v = readMetric(m.match.participants[m.me]!, m.match.durationSec, metric, m.match);
        if (v === null) continue;
        const w = halfLifeWeight(now - m.match.endedAt, cfg.halfLifeDays);
        const pct = lowerIsBetter ? 1 - pctOf(v) : pctOf(v);
        wSum += w;
        youSum += w * v;
        pctSum += w * pct;
        n++;
        perGame.set(m, [...(perGame.get(m) ?? []), pct]);
      }
      if (n === 0 || wSum === 0) continue;
      const reference = bandRef ? bandRef.quantiles[Math.floor((bandRef.quantiles.length - 1) / 2)]! : median(ref);
      metrics.push({ metric, lowerIsBetter, you: youSum / wSum, reference, percentile: pctSum / wSum, games: n });
    }

    let wSum = 0;
    let sum = 0;
    let games = 0;
    for (const [m, pcts] of perGame) {
      if (pcts.length < cfg.minMetrics) continue;
      const w = halfLifeWeight(now - m.match.endedAt, cfg.halfLifeDays);
      wSum += w;
      sum += (w * pcts.reduce((a, b) => a + b, 0)) / pcts.length;
      games++;
    }
    if (games < cfg.minGamesPerRole || wSum === 0) continue;
    axes.push({ axis, score: sum / wSum, games, metrics: metrics.sort((a, b) => Math.abs(b.percentile - 0.5) - Math.abs(a.percentile - 0.5)) });
  }
  const referenceSamples = useBand ? Math.max(...Object.values(band).map((r) => r.n)) : refs.length;
  return { role, games: mine.length, referenceSamples, reference: useBand ? "band" : "games", axes };
}

/** Roles the player has enough games in for a playstyle read, most played first. */
export function playstyleRoles(matches: UserMatch[], cfg: PlaystyleConfig): Position[] {
  const counts = new Map<Position, number>();
  for (const m of matches) {
    const pos = m.match.participants[m.me]?.position;
    if (pos) counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= cfg.minGamesPerRole).sort((a, b) => b[1] - a[1]).map(([r]) => r);
}
