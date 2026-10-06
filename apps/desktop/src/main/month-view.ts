import { formatMetric, metricLabel, renderReason, type ExplainConfig, type GrowthFocus, type MonthlyReport } from "@ldc/engine";
import type { ChampView, MonthView } from "../shared/view";

export interface MonthViewDeps {
  explain: ExplainConfig;
  champion: (id: number) => ChampView | null;
  positionLabel: (role: string) => string;
  growth: GrowthFocus | null;
}

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
/** "GOLD" + "IV" → "Gold IV" (League-V4 strings, only re-cased). */
const rankText = (r: { tier: string; rank: string | null }) => [capital(r.tier.toLowerCase()), r.rank].filter(Boolean).join(" ");
const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The monthly report as the panel shows it. */
export function monthView(r: MonthlyReport, deps: MonthViewDeps): MonthView | null {
  if (!r.games) return null;
  const say = (id: string, slots: Record<string, string | number>) => renderReason({ id, slots }, deps.explain.templates, String);
  const winChange = r.winRate !== null && r.winRateBefore !== null ? r.winRate - r.winRateBefore : null;
  const strip: MonthView["strip"] = [
    { label: "Games", value: String(r.games), ...(r.role ? { sub: say("month.games.sub", { role: r.role }) } : {}) },
    {
      label: "Win rate",
      value: `${Math.round((r.winRate ?? 0) * 100)}%`,
      sub: winChange === null ? say("month.win.none", {}) : say("month.win.vs", { change: winChange }),
      ...(winChange !== null && Math.abs(winChange) >= 0.01 ? { tone: winChange > 0 ? ("pos" as const) : ("neg" as const) } : {}),
    },
    {
      label: "Rank",
      value: r.rank.now ? rankText(r.rank.now) : "—",
      ...(r.rank.start && r.rank.now && rankText(r.rank.start) !== rankText(r.rank.now) ? { sub: say("month.rank.from", { rank: rankText(r.rank.start) }) } : {}),
      ...(r.rank.direction === "up" ? { tone: "pos" as const } : r.rank.direction === "down" ? { tone: "neg" as const } : {}),
    },
    { label: "Goals met", value: String(deps.growth?.met.length ?? 0) },
  ];
  const f = deps.growth?.focus;
  return {
    period: `${shortDate(r.from)} – ${shortDate(r.to)}`,
    games: r.games,
    footer: say("month.footer", { games: r.games }),
    strip,
    role: r.role ? deps.positionLabel(r.role) : null,
    axes: r.axes.map((a) => ({ label: deps.explain.axes[a.axis] ?? a.axis, from: a.from, to: a.to })),
    champions: r.champions.flatMap((c) => {
      const champion = deps.champion(c.championId);
      return champion ? [{ champion, games: c.games, winRate: c.winRate, change: c.change }] : [];
    }),
    focus: {
      met: (deps.growth?.met ?? []).map((m) =>
        say("growth.met", { metric: capital(metricLabel(m.metric, deps.explain)), from: formatMetric(m.baseline, m.metric, deps.explain), to: formatMetric(m.you, m.metric, deps.explain) }),
      ),
      current: f
        ? say("month.focus.current", { metric: capital(metricLabel(f.metric, deps.explain)), you: formatMetric(f.you, f.metric, deps.explain), target: formatMetric(f.target, f.metric, deps.explain) })
        : null,
    },
  };
}
