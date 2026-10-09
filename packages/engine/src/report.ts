import type { ChampionId, Position, UserMatch } from "@ldc/shared";
import type { EngineConfig, RankBandConfig } from "./config";
import { computePlaystyle, readMetric, type MetricReference } from "./playstyle";

export type ReportConfig = EngineConfig["report"];

/** Your rank on a day (League-V4 tier and division strings, as Riot sends them). */
export interface RankPoint {
  day: string;
  queueType: string;
  tier: string;
  rank: string | null;
}

export interface MonthlyReport {
  /** The period: [from, to) in epoch ms. */
  from: number;
  to: number;
  games: number;
  winRate: number | null;
  /** Your win rate in the same length of time before the period (null without games then). */
  winRateBefore: number | null;
  /** The role you played most in the period, whose style trends are shown. */
  role: Position | null;
  /**
   * Each playstyle axis over the period before (from) and this period (to), as the mean of each
   * game's score (0–100), and whether it really changed: "up" / "down" / "steady", or null when
   * either side has too few games to tell.
   */
  axes: { axis: string; from: number | null; to: number; changed: "up" | "down" | "steady" | null }[];
  /**
   * Raw numbers in that role (config report.stats), this period's games against the period before:
   * means, and whether the value really went up or down (same test as the axes; null: too few games).
   */
  stats: { metric: string; lowerIsBetter: boolean; from: number | null; to: number; changed: "up" | "down" | "steady" | null }[];
  /** Your roles in the period, as shares of its games, most first. */
  roles: { role: Position; share: number }[];
  /** Share of the period's games on your top `n` champions, and the same for the period before (null without games then). */
  focus: { n: number; now: number; before: number | null } | null;
  /** Champions you played most in the period, with the change against your games on them before it. */
  champions: { championId: ChampionId; games: number; winRate: number; change: number | null }[];
  /** Your rank at the start and now, in your main ranked queue; `direction` compares tiers only (config order). */
  rank: { start: { tier: string; rank: string | null } | null; now: { tier: string; rank: string | null } | null; direction: "up" | "down" | "same" | null };
}

/** Mean, sample variance and count. */
function stats(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.length > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1) : 0;
  return { mean, variance, n: xs.length };
}

/**
 * Whether this period's values really differ from the period before's (separate games): each side
 * with minGamesPerSide games, a Welch z of at least z and a difference of at least minChange.
 * Null when either side has too few games to tell.
 */
function trend(cur: number[], prev: number[], t: ReportConfig["trend"], minChange: number): "up" | "down" | "steady" | null {
  if (cur.length < t.minGamesPerSide || prev.length < t.minGamesPerSide) return null;
  const c = stats(cur);
  const p = stats(prev);
  const se = Math.sqrt(c.variance / c.n + p.variance / p.n);
  const d = c.mean - p.mean;
  // No spread at all (every game the same) makes any big enough difference real.
  const real = Math.abs(d) >= minChange && (se === 0 || Math.abs(d) / se >= t.z);
  return real ? (d > 0 ? "up" : "down") : "steady";
}

/** Share of games on the `n` champions played most in them. */
function topShare(ms: UserMatch[], n: number): number | null {
  if (!ms.length) return null;
  const counts = new Map<ChampionId, number>();
  for (const m of ms) counts.set(m.match.participants[m.me]!.championId, (counts.get(m.match.participants[m.me]!.championId) ?? 0) + 1);
  return [...counts.values()].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0) / ms.length;
}

const win = (ms: UserMatch[]) => (ms.length ? ms.filter((m) => m.match.participants[m.me]?.win).length / ms.length : null);

/**
 * The monthly report (DESIGN §7, F8): trends over many games, never a verdict on one. Pure:
 * from your own matches (and your rank history, when the server keeps it).
 */
export function monthlyReport(
  matches: UserMatch[],
  now: number,
  cfg: { report: ReportConfig; playstyle: EngineConfig["playstyle"] },
  opts: { bands: RankBandConfig; rankHistory?: RankPoint[]; references?: (role: Position) => Record<string, MetricReference> | undefined },
): MonthlyReport {
  const span = cfg.report.days * 86_400_000;
  const from = now - span;
  const inPeriod = matches.filter((m) => m.match.endedAt >= from && m.match.endedAt < now);
  const before = matches.filter((m) => m.match.endedAt < from && m.match.endedAt >= from - span);
  const older = matches.filter((m) => m.match.endedAt < from);

  const roleCounts = new Map<Position, number>();
  for (const m of inPeriod) {
    const p = m.match.participants[m.me]?.position;
    if (p) roleCounts.set(p, (roleCounts.get(p) ?? 0) + 1);
  }
  const role = [...roleCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const axes: MonthlyReport["axes"] = [];
  if (role) {
    // Separate sets: this period's games against the period before, game by game (not overlapping windows).
    const refs = opts.references?.(role);
    const style = computePlaystyle(matches.filter((m) => m.match.endedAt < now), role, now, cfg.playstyle, refs);
    const t = cfg.report.trend;
    for (const a of style?.axes ?? []) {
      const cur = a.perGame.filter((g) => g.endedAt >= from).map((g) => g.score * 100);
      const prev = a.perGame.filter((g) => g.endedAt < from && g.endedAt >= from - span).map((g) => g.score * 100);
      if (!cur.length) continue;
      axes.push({ axis: a.axis, from: prev.length ? Math.round(stats(prev).mean) : null, to: Math.round(stats(cur).mean), changed: trend(cur, prev, t, t.minChange) });
    }
  }

  const numbers: MonthlyReport["stats"] = [];
  if (role && cfg.report.stats) {
    const inRole = (ms: UserMatch[]) => ms.filter((m) => m.match.participants[m.me]?.position === role);
    const values = (ms: UserMatch[], metric: string) =>
      ms.map((m) => readMetric(m.match.participants[m.me]!, m.match.durationSec, metric, m.match)).filter((v): v is number => v !== null);
    for (const raw of cfg.report.stats.metrics) {
      const lowerIsBetter = raw.startsWith("-");
      const metric = lowerIsBetter ? raw.slice(1) : raw;
      const cur = values(inRole(inPeriod), metric);
      const prev = values(inRole(before), metric);
      if (!cur.length) continue;
      const to = stats(cur).mean;
      const fromMean = prev.length ? stats(prev).mean : null;
      // The smallest change that counts is a share of the value (deaths per minute and damage differ in scale).
      const minChange = cfg.report.stats.minRelChange * Math.max(Math.abs(to), Math.abs(fromMean ?? 0));
      numbers.push({ metric, lowerIsBetter, from: fromMean, to, changed: trend(cur, prev, cfg.report.trend, minChange) });
    }
  }

  const roles = [...roleCounts].map(([r, n]) => ({ role: r, share: n / inPeriod.length })).sort((a, b) => b.share - a.share || a.role.localeCompare(b.role));
  const focusTop = cfg.report.focusTop;
  const focusNow = focusTop ? topShare(inPeriod, focusTop) : null;
  const focus = focusTop && focusNow !== null ? { n: focusTop, now: focusNow, before: topShare(before, focusTop) } : null;

  const byChamp = new Map<ChampionId, UserMatch[]>();
  for (const m of inPeriod) {
    const id = m.match.participants[m.me]!.championId;
    byChamp.set(id, [...(byChamp.get(id) ?? []), m]);
  }
  const champions = [...byChamp]
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
    .slice(0, cfg.report.maxChampions)
    .map(([championId, ms]) => {
      const prior = older.filter((m) => m.match.participants[m.me]?.championId === championId);
      const wr = win(ms)!;
      return { championId, games: ms.length, winRate: wr, change: prior.length >= cfg.report.minPriorGames ? wr - win(prior)! : null };
    });

  // Rank: your highest-priority ranked queue that has history.
  const history = opts.rankHistory ?? [];
  const queue = opts.bands.rankedQueueTypesByPriority.find((q) => history.some((h) => h.queueType === q)) ?? null;
  const points = history.filter((h) => h.queueType === queue).sort((a, b) => a.day.localeCompare(b.day));
  const fromDay = new Date(from).toISOString().slice(0, 10);
  const startPoint = [...points].reverse().find((p) => p.day <= fromDay) ?? points[0] ?? null;
  const nowPoint = points.at(-1) ?? null;
  const order = opts.bands.bands.flatMap((b) => b.tiers);
  const ti = (t: string) => order.indexOf(t);
  const direction =
    startPoint && nowPoint && ti(startPoint.tier) >= 0 && ti(nowPoint.tier) >= 0
      ? ti(nowPoint.tier) > ti(startPoint.tier)
        ? "up"
        : ti(nowPoint.tier) < ti(startPoint.tier)
          ? "down"
          : "same"
      : null;

  return {
    from,
    to: now,
    games: inPeriod.length,
    winRate: win(inPeriod),
    winRateBefore: win(before),
    role,
    axes,
    stats: numbers,
    roles,
    focus,
    champions,
    rank: { start: startPoint && { tier: startPoint.tier, rank: startPoint.rank }, now: nowPoint && { tier: nowPoint.tier, rank: nowPoint.rank }, direction },
  };
}
