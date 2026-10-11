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
  const f = deps.growth?.focus;
  const days = Math.max(1, Math.round((r.to - r.from) / 86_400_000));
  const points = winChange === null ? 0 : Math.round(Math.abs(winChange) * 100);
  return {
    period: `${shortDate(r.from)} – ${shortDate(r.to)}`,
    games: r.games,
    steadyNote: say("month.steady", { games: r.games }),
    rank: r.rank.now
      ? r.rank.start && rankText(r.rank.start) !== rankText(r.rank.now)
        ? say("month.rank.from", { now: rankText(r.rank.now), start: rankText(r.rank.start) })
        : say("month.rank", { now: rankText(r.rank.now) })
      : null,
    winRate: {
      from: r.winRateBefore,
      to: r.winRate ?? 0,
      text:
        winChange === null
          ? say("month.win.first", {})
          : points === 0
            ? say("month.win.same", { days })
            : say(winChange > 0 ? "month.win.up" : "month.win.down", { points, days }),
    },
    gamesBefore: r.gamesBefore,
    gamesBeforeText: say("month.gamesBefore", { games: r.gamesBefore }),
    roles: r.roles.map((x) => ({ role: deps.positionLabel(x.role), share: x.share, text: say("month.role.share", { role: deps.positionLabel(x.role), share: x.share }) })),
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
