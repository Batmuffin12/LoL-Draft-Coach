import { z } from "zod";
import type { ChampionId, Reason } from "@ldc/shared";
import { ConfigError } from "./config";

export const ExplainConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  templates: z.record(z.string(), z.string()),
  /** Display names of playstyle axes. */
  axes: z.record(z.string(), z.string()).default({}),
  /** Display names and number formats of playstyle metrics. */
  metrics: z.record(z.string(), z.object({ label: z.string(), format: z.enum(["percent", "decimal", "integer"]) })).default({}),
  settings: z.object({
    /** Score gap (0..1) between #1 and #2 at or above which #1 is a "clear pick". */
    clearGap: z.number().min(0).max(1),
    /** Below this many games on the champion (and below minMasteryPoints) the pick is "thin". */
    minGames: z.number().int().min(0),
    minMasteryPoints: z.number().min(0),
    /** Playstyle scores (0..1) at/above playstyleHigh read as a strength, at/below playstyleLow as room to grow. */
    playstyleHigh: z.number().min(0).max(1),
    playstyleLow: z.number().min(0).max(1),
  }),
});
export type ExplainConfig = z.infer<typeof ExplainConfigSchema>;

export function parseExplainConfig(json: unknown): ExplainConfig {
  const r = ExplainConfigSchema.safeParse(json);
  if (!r.success) throw new ConfigError(`Invalid explain config:\n${z.prettifyError(r.error)}`);
  return r.data;
}

/** Builds a structured reason (template id + the values behind it). */
export const reason = (id: string, slots: Reason["slots"] = {}): Reason => ({ id, slots });

/**
 * Fills a template from a reason's slots. Supported slot forms:
 * `{x}` value, `{x:pct}` 0..1 share as a whole percent, `{x:champion}` champion name,
 * `{x:item}` / `{x:rune}` item or rune name,
 * `{x|one|many}` singular/plural by the number in slot x. A missing template renders
 * the id, so a typo is visible instead of silent.
 */
export interface ReasonNames {
  item?: (id: number) => string;
  rune?: (id: number) => string;
}

export function renderReason(r: Reason, templates: Record<string, string>, championName: (id: ChampionId) => string, names: ReasonNames = {}): string {
  const t = templates[r.id];
  if (t === undefined) return r.id;
  return t.replace(/\{(\w+)(?::(\w+))?(?:\|([^|}]*)\|([^}]*))?\}/g, (_all, key: string, fmt: string | undefined, one?: string, many?: string) => {
    const v = r.slots[key];
    if (one !== undefined) return v === 1 ? one : (many ?? "");
    if (v === undefined) return "";
    if (fmt === "pct" && typeof v === "number") return String(Math.round(v * 100));
    if (fmt === "pct1" && typeof v === "number") return (v * 100).toFixed(1);
    if (fmt === "signedPct1" && typeof v === "number") {
      const s = (v * 100).toFixed(1);
      return v > 0 && s !== "0.0" ? `+${s}` : s === "-0.0" ? "0.0" : s;
    }
    if (fmt === "champion" && typeof v === "number") return championName(v);
    if (fmt === "item" && typeof v === "number") return names.item?.(v) ?? `#${v}`;
    if (fmt === "rune" && typeof v === "number") return names.rune?.(v) ?? `#${v}`;
    return String(v);
  });
}

export type Confidence = "clear" | "close" | "thin";

/**
 * How sure the top pick is, from our own data (no outside model):
 * - "thin": few games and little mastery on the champion;
 * - "clear": a clear score gap to the runner-up (or no runner-up);
 * - "close": otherwise.
 */
export function confidenceOf(
  top: { score: number; games: number; masteryPoints: number },
  runnerUp: { score: number } | undefined,
  settings: ExplainConfig["settings"],
): Confidence {
  if (top.games < settings.minGames && top.masteryPoints < settings.minMasteryPoints) return "thin";
  if (!runnerUp || top.score - runnerUp.score >= settings.clearGap) return "clear";
  return "close";
}

/** Formats a metric value for display, per the explain config (fallback: one decimal). */
export function formatMetric(value: number, metric: string, cfg: ExplainConfig): string {
  const f = cfg.metrics[metric]?.format ?? "decimal";
  if (f === "percent") return `${Math.round(value * 100)}%`;
  if (f === "integer") return String(Math.round(value));
  return value.toFixed(1);
}

/** A metric's display name: configured label, else the Riot field name split into words. */
export function metricLabel(metric: string, cfg: ExplainConfig): string {
  const label = cfg.metrics[metric]?.label;
  if (label) return label;
  const field = metric.replace(/^challenges\./, "");
  return field.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
}
