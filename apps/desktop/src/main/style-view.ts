import { formatMetric, metricLabel, metricShort, renderReason, type ExplainConfig, type MetricResult, type SideSplit, type StyleProfile } from "@ldc/engine";
import type { NumberView, PlaystyleView } from "../shared/view";

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
