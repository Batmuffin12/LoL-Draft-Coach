import { formatMetric, metricLabel, readMetric, renderReason, type ExplainConfig, type FocusMetric, type GrowthFocus } from "@ldc/engine";
import type { UserMatch } from "@ldc/shared";
import type { FocusView, PostGameView } from "../shared/view";

import { capital } from "./reason-view";

export interface FocusViewDeps {
  explain: ExplainConfig;
  targetStep: number;
  checkGames: number;
  /** "Gold to Platinum", when the band's data was used. */
  bandName: string | null;
  championName: (id: number) => string;
  /** "Mid" for "middle". */
  positionLabel: (role: string) => string;
}

/** The focus card's view: the focus metric with formatted numbers and why it was chosen. */
export function focusView(g: GrowthFocus, deps: FocusViewDeps): FocusView | null {
  const f = g.focus;
  if (!f) return null;
  const { explain } = deps;
  const fmt = (v: number) => formatMetric(v, f.metric, explain);
  const label = metricLabel(f.metric, explain);
  const why = renderReason(
    { id: f.importanceFrom === "band" && deps.bandName ? "growth.why.band" : "growth.why.games", slots: { band: deps.bandName ?? "", role: g.role, metric: label, gap: Math.abs(f.importance), step: deps.targetStep } },
    explain.templates,
    deps.championName,
  );
  const dir = f.lowerIsBetter ? "less" : "more";
  return {
    label: capital(label),
    title: renderReason({ id: `growth.title.${dir}`, slots: { metric: label } }, explain.templates, deps.championName),
    goalText: renderReason({ id: `growth.goal.${dir}`, slots: { target: fmt(f.target) } }, explain.templates, deps.championName),
    goalHint: renderReason({ id: "growth.goalHint", slots: { step: deps.targetStep } }, explain.templates, deps.championName),
    on:
      g.scope === "few"
        ? renderReason({ id: "growth.on.few", slots: { role: deps.positionLabel(g.role), games: g.games } }, explain.templates, deps.championName)
        : [g.championId !== null ? deps.championName(g.championId) : null, deps.positionLabel(g.role)].filter(Boolean).join(" · "),
    you: f.you,
    target: f.target,
    typical: f.typical,
    youText: fmt(f.you),
    targetText: fmt(f.target),
    typicalText: fmt(f.typical),
    typicalLine: renderReason(
      { id: g.reference === "band" ? "growth.typical.band" : "growth.typical.games", slots: { value: fmt(f.typical), role: g.role } },
      explain.templates,
      deps.championName,
    ),
    lowerIsBetter: f.lowerIsBetter,
    checkGames: deps.checkGames,
    recent: f.recent,
    why,
    tips: explain.tips[`${g.role}:${f.metric}`] ?? [],
    met: g.met.map((m: FocusMetric) =>
      renderReason({ id: "growth.met", slots: { metric: capital(metricLabel(m.metric, explain)), from: formatMetric(m.baseline, m.metric, explain), to: formatMetric(m.you, m.metric, explain) } }, explain.templates, deps.championName),
    ),
  };
}

/** Your focus metric in one logged game against its target, for the post-game card. */
export function focusInGame(g: GrowthFocus | null, matchId: string | null, matches: UserMatch[], explain: ExplainConfig): PostGameView["focus"] {
  const f = g?.focus;
  if (!f || !matchId) return null;
  const m = matches.find((x) => x.match.matchId === matchId);
  const me = m?.match.participants[m.me];
  if (!m || !me) return null;
  // The goal is set on one role (and champion): another role's game says nothing about it.
  if (me.position !== g!.role || (g!.championId !== null && me.championId !== g!.championId)) return null;
  const v = readMetric(me, m.match.durationSec, f.metric);
  if (v === null) return null;
  // One game's count (deaths, kills) reads as a whole number: "8", not the averages' "8.0".
  const whole = Number.isInteger(v) && explain.metrics[f.metric]?.count === true;
  return {
    label: capital(metricLabel(f.metric, explain)),
    value: whole ? String(v) : formatMetric(v, f.metric, explain),
    target: formatMetric(f.target, f.metric, explain),
    met: f.lowerIsBetter ? v <= f.target : v >= f.target,
  };
}
