import { formatMetric, metricLabel, metricShort, renderReason, type ExplainConfig, type GrowthFocus, type MonthlyReport } from "@ldc/engine";
import type { ChampView, MonthView } from "../shared/view";
import { capital } from "./reason-view";

export interface MonthViewDeps {
  explain: ExplainConfig;
  champion: (id: number) => ChampView | null;
  positionLabel: (role: string) => string;
  growth: GrowthFocus | null;
}

/** "GOLD" + "IV" → "Gold IV" (League-V4 strings, only re-cased). */
const rankText = (r: { tier: string; rank: string | null }) => [capital(r.tier.toLowerCase()), r.rank].filter(Boolean).join(" ");
const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The monthly report as the panel shows it. */
export function monthView(r: MonthlyReport, deps: MonthViewDeps): MonthView | null {
  if (!r.games) return null;
  const say = (id: string, slots: Record<string, string | number>) => renderReason({ id, slots }, deps.explain.templates, String);
  const winChange = r.winRate !== null && r.winRateBefore !== null ? r.winRate - r.winRateBefore : null;
  const strip: MonthView["strip"] = [
    {
      label: "Games",
      value: String(r.games),
      // Your top two roles with their shares ("bot 60% · jungle 30%"); one role reads "mostly bot".
      ...(r.roles.length > 1
        ? { sub: r.roles.slice(0, 2).map((x) => say("month.role.share", { role: x.role, share: x.share })).join(" · ") }
        : r.role
          ? { sub: say("month.games.sub", { role: r.role }) }
          : {}),
    },
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
    axes: r.axes.map((a) => ({ label: deps.explain.axes[a.axis] ?? a.axis, from: a.from, to: a.to, changed: a.changed })),
    stats: r.stats.map((s) => {
      const better = s.changed === "up" || s.changed === "down" ? (s.changed === "up") !== s.lowerIsBetter : null;
      return {
        label: metricShort(s.metric, deps.explain),
        title: capital(metricLabel(s.metric, deps.explain)),
        from: s.from === null ? null : formatMetric(s.from, s.metric, deps.explain),
        to: formatMetric(s.to, s.metric, deps.explain),
        changed: s.changed,
        tone: better === null ? null : better ? ("pos" as const) : ("neg" as const),
      };
    }),
    focusLine: r.focus
      ? r.focus.before === null
        ? say("month.focus.first", { n: r.focus.n, now: r.focus.now })
        : say("month.focus.line", { n: r.focus.n, now: r.focus.now, before: r.focus.before })
      : null,
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
