import type { ChampionId, Position, UserMatch } from "@ldc/shared";
import type { EngineConfig, RankBandConfig } from "./config";
import { computePlaystyle, type MetricReference } from "./playstyle";

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
  /** Each playstyle axis at the start of the period (your games before it) and now (0–100). */
  axes: { axis: string; from: number | null; to: number }[];
  /** Champions you played most in the period, with the change against your games on them before it. */
  champions: { championId: ChampionId; games: number; winRate: number; change: number | null }[];
  /** Your rank at the start and now, in your main ranked queue; `direction` compares tiers only (config order). */
  rank: { start: { tier: string; rank: string | null } | null; now: { tier: string; rank: string | null } | null; direction: "up" | "down" | "same" | null };
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
    const refs = opts.references?.(role);
    const nowStyle = computePlaystyle(matches.filter((m) => m.match.endedAt < now), role, now, cfg.playstyle, refs);
    const startStyle = computePlaystyle(older, role, from, cfg.playstyle, refs);
    for (const a of nowStyle?.axes ?? []) {
      const s = startStyle?.axes.find((x) => x.axis === a.axis);
      axes.push({ axis: a.axis, from: s ? Math.round(s.score * 100) : null, to: Math.round(a.score * 100) });
    }
  }

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
    champions,
    rank: { start: startPoint && { tier: startPoint.tier, rank: startPoint.rank }, now: nowPoint && { tier: nowPoint.tier, rank: nowPoint.rank }, direction },
  };
}
