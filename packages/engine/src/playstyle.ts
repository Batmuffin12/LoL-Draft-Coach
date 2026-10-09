import type { MatchSummary, ParticipantSummary, Position, UserMatch } from "@ldc/shared";
import { halfLifeWeight } from "./comfort";
import type { EngineConfig } from "./config";

export type PlaystyleConfig = EngineConfig["playstyle"];

/**
 * Reads one metric from a participant. Names are Riot's: "challenges.<field>" reads a
 * Match-V5 challenges value; a few per-minute values are derived from the summary.
 * Returns null when the game doesn't carry the metric (fields vary by patch and role).
 * With the match, metrics from its timeline (null without the data, e.g. timelines stored before
 * these were kept): "laneGoldDiffAt14" and "laneCsDiffAt10" (gold or CS minus the lane opponent's,
 * the one enemy in the same position), "wardsPlacedBefore14", "earlyEpicMonsterTakedowns"
 * (dragons, grubs and herald before 14 min that you killed or assisted).
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
    case "kda":
      return (p.kills + p.assists) / Math.max(1, p.deaths);
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
      return laneDiff(p, match, match?.timeline?.gold, 14);
    case "laneCsDiffAt10":
      return laneDiff(p, match, match?.timeline?.cs, 10);
    case "wardsPlacedBefore14": {
      const wards = match?.timeline?.wards;
      const me = match ? match.participants.indexOf(p) : -1;
      return wards && me >= 0 ? wards.filter(([sec, placer]) => placer === me && sec < EARLY_SEC).length : null;
    }
    case "earlyEpicMonsterTakedowns": {
      const monsters = match?.timeline?.monsters;
      const me = match ? match.participants.indexOf(p) : -1;
      return monsters && me >= 0 ? monsters.filter(([sec, killer, assists]) => sec < EARLY_SEC && (killer === me || (assists & (1 << me)) !== 0)).length : null;
    }
    default:
      return null;
  }
}

/** The early-game cut for timeline counts (14 min, the end of the laning phase as plates fall). */
const EARLY_SEC = 14 * 60;

/** A per-frame value minus the lane opponent's (the one enemy in the same position) at `minute`. */
function laneDiff(p: ParticipantSummary, match: Pick<MatchSummary, "participants" | "timeline"> | undefined, frames: number[][] | undefined, minute: number): number | null {
  if (!match || !frames || !p.position) return null;
  const me = match.participants.indexOf(p);
  const opponents = match.participants.flatMap((o, i) => (o.teamId !== p.teamId && o.position === p.position ? [i] : []));
  if (me < 0 || opponents.length !== 1) return null;
  const mine = frames[me]?.[minute];
  const theirs = frames[opponents[0]!]?.[minute];
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
  /** Each of those games' own axis score (0..1, unweighted), for trends over separate sets of games. */
  perGame: { endedAt: number; score: number }[];
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
  const ctx = context(matches, role, now, cfg, bandReferences);
  if (!ctx) return null;

  const axes: PlaystyleAxis[] = [];
  for (const [axis, def] of Object.entries(cfg.axes)) {
    const metrics: MetricResult[] = [];
    // Per game, the axis value is the mean percentile of the metrics that game has.
    const perGame = new Map<UserMatch, number[]>();
    for (const raw of def.metrics) {
      const measured = measure(raw, ctx);
      if (!measured) continue;
      metrics.push(measured.result);
      for (const [m, pct] of measured.perGame) perGame.set(m, [...(perGame.get(m) ?? []), pct]);
    }

    let wSum = 0;
    let sum = 0;
    let games = 0;
    const scores: PlaystyleAxis["perGame"] = [];
    for (const [m, pcts] of perGame) {
      if (pcts.length < cfg.minMetrics) continue;
      const w = halfLifeWeight(now - m.match.endedAt, cfg.halfLifeDays);
      const score = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      wSum += w;
      sum += w * score;
      games++;
      scores.push({ endedAt: m.match.endedAt, score });
    }
    if (games < cfg.minGamesPerRole || wSum === 0) continue;
    axes.push({ axis, score: sum / wSum, games, metrics: metrics.sort((a, b) => Math.abs(b.percentile - 0.5) - Math.abs(a.percentile - 0.5)), perGame: scores });
  }
  const referenceSamples = ctx.band ? Math.max(...Object.values(ctx.band).map((r) => r.n)) : ctx.refs.length;
  return { role, games: ctx.mine.length, referenceSamples, reference: ctx.band ? "band" : "games", axes };
}

/** What measuring a metric needs: your games in the role, the reference and the config. */
interface MetricContext {
  mine: UserMatch[];
  refs: { p: ParticipantSummary; durationSec: number; match: MatchSummary }[];
  /** Band references with enough samples (live meta), or null to use the others in your games. */
  band: Record<string, MetricReference> | null;
  now: number;
  cfg: PlaystyleConfig;
  /** Sorted reference values per metric (from your games). */
  cache: Map<string, number[]>;
}

/**
 * One metric ("-" prefix = lower is better) in your games against the reference: your
 * recency-weighted average, the reference median and your average percentile, with each game's
 * percentile. Null without enough reference values or without any game carrying it.
 */
function measure(raw: string, ctx: MetricContext): { result: MetricResult; perGame: Map<UserMatch, number> } | null {
  const lowerIsBetter = raw.startsWith("-");
  const metric = lowerIsBetter ? raw.slice(1) : raw;
  const bandRef = ctx.band?.[metric];
  let ref: number[] = [];
  if (!bandRef) {
    // A metric the band lacks falls back to the others in your games.
    ref = ctx.cache.get(metric) ?? ctx.refs.map((r) => readMetric(r.p, r.durationSec, metric, r.match)).filter((x): x is number => x !== null).sort((a, b) => a - b);
    ctx.cache.set(metric, ref);
    if (ref.length < ctx.cfg.minReferenceSamples) return null;
  }
  const pctOf = (v: number) => (bandRef ? percentileFromQuantiles(v, bandRef.quantiles) : empiricalPercentile(v, ref));
  let wSum = 0;
  let youSum = 0;
  let pctSum = 0;
  let n = 0;
  const perGame = new Map<UserMatch, number>();
  for (const m of ctx.mine) {
    const v = readMetric(m.match.participants[m.me]!, m.match.durationSec, metric, m.match);
    if (v === null) continue;
    const w = halfLifeWeight(ctx.now - m.match.endedAt, ctx.cfg.halfLifeDays);
    const pct = lowerIsBetter ? 1 - pctOf(v) : pctOf(v);
    wSum += w;
    youSum += w * v;
    pctSum += w * pct;
    n++;
    perGame.set(m, pct);
  }
  if (n === 0 || wSum === 0) return null;
  const reference = bandRef ? bandRef.quantiles[Math.floor((bandRef.quantiles.length - 1) / 2)]! : median(ref);
  return { result: { metric, lowerIsBetter, you: youSum / wSum, reference, percentile: pctSum / wSum, games: n }, perGame };
}

/**
 * Single metrics in one role against the same reference as the playstyle (band, else the others
 * in your games): the headline numbers ("CS per minute: you 6.6, typical 6.9"). Metrics without
 * enough reference values are left out; null below the role's minimum games.
 */
export function measureMetrics(
  matches: UserMatch[],
  role: Position,
  metrics: string[],
  now: number,
  cfg: PlaystyleConfig,
  bandReferences?: Record<string, MetricReference>,
): MetricResult[] | null {
  const ctx = context(matches, role, now, cfg, bandReferences);
  if (!ctx) return null;
  return metrics.flatMap((raw) => {
    const m = measure(raw, ctx);
    return m ? [m.result] : [];
  });
}

function context(matches: UserMatch[], role: Position, now: number, cfg: PlaystyleConfig, bandReferences?: Record<string, MetricReference>): MetricContext | null {
  const mine = matches.filter((m) => m.match.participants[m.me]?.position === role);
  if (!role || mine.length < cfg.minGamesPerRole) return null;
  const refs = matches.flatMap((m) =>
    m.match.participants.filter((p, i) => i !== m.me && p.position === role).map((p) => ({ p, durationSec: m.match.durationSec, match: m.match })),
  );
  const band = Object.fromEntries(Object.entries(bandReferences ?? {}).filter(([, r]) => r.n >= cfg.minReferenceSamples && r.quantiles.length > 1));
  const useBand = Object.keys(band).length > 0;
  if (!useBand && refs.length < cfg.minReferenceSamples) return null;
  return { mine, refs, band: useBand ? band : null, now, cfg, cache: new Map() };
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
