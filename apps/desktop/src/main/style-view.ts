import { computePlaystyle, formatMetric, metricLabel, metricShort, playstyleRoles, renderReason, styleProfile, type EngineConfig, type ExplainConfig, type MetricReference, type MetricResult, type SideSplit, type StyleProfile } from "@ldc/engine";
import type { ChampionId, Position, UserMatch } from "@ldc/shared";
import type { FactRow, NumberView, PlaystyleView } from "../shared/view";

/** One metric as a sentence:"CS at 10 min: you 56, typical in your rank 61". */
export function metricSentence(m: MetricResult, explain: ExplainConfig): string {
  return renderReason(
    { id: "playstyle.metric", slots: { metric: metricLabel(m.metric, explain), you: formatMetric(m.you, m.metric, explain), reference: formatMetric(m.reference, m.metric, explain) } },
    explain.templates,
    String,
  );
}

/** Headline numbers as the Style tab shows them; tone from your average percentile (already turned for lower-is-better). */
export function numberViews(headline: MetricResult[], explain: ExplainConfig, toneGap: number): NumberView[] {
  return headline.map((m) => ({
    label: metricShort(m.metric, explain),
    you: formatMetric(m.you, m.metric, explain),
    typical: formatMetric(m.reference, m.metric, explain),
    tone: m.percentile >= 0.5 + toneGap ? "pos" : m.percentile <= 0.5 - toneGap ? "neg" : null,
    // The percentile is already turned for lower-is-better: 0.5 is typical, right of it better.
    relative: Math.max(-1, Math.min(1, (m.percentile - 0.5) * 2)),
    title: renderReason(
      {
        id: "style.number.title",
        slots: { metric: metricLabel(m.metric, explain), you: formatMetric(m.you, m.metric, explain), reference: formatMetric(m.reference, m.metric, explain), games: m.games },
      },
      explain.templates,
      String,
    ),
  }));
}

/** Pool focus, classes and damage split, worded. */
export function howView(p: StyleProfile, explain: ExplainConfig): NonNullable<PlaystyleView["how"]> {
  const say = (id: string, slots: Record<string, string | number>) => renderReason({ id, slots }, explain.templates, String);
  const d = p.damage;
  return {
    games: p.games,
    focus: p.focus.top.map((t) => say("style.focus.top", { n: t.n, share: t.share })).join(" · "),
    champions: say("style.focus.champions", { champions: p.focus.champions }),
    classes: p.classes.map((c) => ({ label: c.tag, share: c.share })),
    damage: d
      ? (["physical", "magic", "true"] as const).map((kind) => ({ kind, label: say(`style.damage.${kind}`, {}), share: d[kind] }))
      : null,
  };
}

/** Your win rate by side, only when the gap is real. */
export function sideView(s: SideSplit | null, explain: ExplainConfig): string | null {
  if (!s?.better) return null;
  const say = (id: string, slots: Record<string, string | number> = {}) => renderReason({ id, slots }, explain.templates, String);
  const [mine, other] = s.better === "blue" ? [s.blue, s.red] : [s.red, s.blue];
  return say("style.side", {
    win: mine.winRate,
    side: say(`style.side.${s.better}`),
    other: other.winRate,
    otherSide: say(`style.side.${s.better === "blue" ? "red" : "blue"}`),
    games: s.blue.games + s.red.games,
  });
}

/**
 * A role's style from its high and low axes, as two short lists built from a phrase per axis and
 * level ("Strong": Out-farm your rank, Win lane early; "Weak spots": Vision, Early deaths). No numbers;
 * one line when nothing stands out, empty without axes.
 */
export function styleSummary(axes: { axis: string; level: "high" | "mid" | "low" }[], templates: Record<string, string>): FactRow[] {
  if (!axes.length) return [];
  const say = (id: string) => renderReason({ id, slots: {} }, templates, String);
  const row = (level: "high" | "low", label: string): FactRow[] => {
    const items = axes
      .filter((a) => a.level === level)
      .map((a) => templates[`style.summary.${level}.${a.axis}`])
      .filter((x): x is string => !!x)
      .map((x) => ({ text: x.charAt(0).toUpperCase() + x.slice(1) }));
    return items.length ? [{ label: say(label), items }] : [];
  };
  const rows = [...row("high", "style.summary.strong"), ...row("low", "style.summary.weak")];
  return rows.length ? rows : [{ label: say("style.summary.evenLabel"), items: [{ text: say("style.summary.even") }] }];
}

/**
 * Playstyle per role (lobby Style tab), for your three most played roles: axes as percentiles against
 * others in the role, the headline numbers behind them, and how you play the role (pool focus, classes, damage).
 */
export function playstyleViews(
  matches: UserMatch[],
  now: number,
  engine: EngineConfig,
  explain: ExplainConfig,
  references: (role: Position) => Record<string, MetricReference> | undefined,
  tagsOf: (id: ChampionId) => string[] | undefined,
): PlaystyleView[] {
  const level = (s: number) => (s >= explain.settings.playstyleHigh ? "high" : s <= explain.settings.playstyleLow ? "low" : "mid") as "high" | "mid" | "low";
  const views: PlaystyleView[] = [];
  for (const role of playstyleRoles(matches, engine.playstyle).slice(0, 3)) {
    const refs = references(role);
    const ps = computePlaystyle(matches, role, now, engine.playstyle, refs);
    if (!ps) continue;
    const profile = engine.style ? styleProfile(matches, role, now, { playstyle: engine.playstyle, style: engine.style }, tagsOf, refs) : null;
    views.push({
      role,
      games: ps.games,
      axes: ps.axes.map((a) => {
        const m = a.metrics[0];
        const lv = level(a.score);
        return {
          axis: a.axis,
          label: explain.axes[a.axis] ?? a.axis,
          score: Math.round(a.score * 100),
          level: lv,
          levelLabel: renderReason({ id: `playstyle.level.${lv}`, slots: {} }, explain.templates, String),
          detail: m ? metricSentence(m, explain) : null,
          games: a.games,
          metrics: a.metrics.map((x) => metricSentence(x, explain)),
        };
      }),
      numbers: profile && engine.style ? numberViews(profile.headline, explain, engine.style.toneGap) : [],
      summary: styleSummary(ps.axes.map((a) => ({ axis: a.axis, level: level(a.score) })), explain.templates),
      how: profile ? howView(profile, explain) : null,
    });
  }
  return views;
}
