import { z } from "zod";
import type { ChampionId, Reason } from "@ldc/shared";
import { ConfigError } from "./config";

export const ExplainConfigSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  templates: z.record(z.string(), z.string()),
  settings: z.object({
    /** Score gap (0..1) between #1 and #2 at or above which #1 is a "clear pick". */
    clearGap: z.number().min(0).max(1),
    /** Below this many games on the champion (and below minMasteryPoints) the pick is "thin". */
    minGames: z.number().int().min(0),
    minMasteryPoints: z.number().min(0),
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
 * `{x|one|many}` singular/plural by the number in slot x. A missing template renders
 * the id, so a typo is visible instead of silent.
 */
export function renderReason(r: Reason, templates: Record<string, string>, championName: (id: ChampionId) => string): string {
  const t = templates[r.id];
  if (t === undefined) return r.id;
  return t.replace(/\{(\w+)(?::(\w+))?(?:\|([^|}]*)\|([^}]*))?\}/g, (_all, key: string, fmt: string | undefined, one?: string, many?: string) => {
    const v = r.slots[key];
    if (one !== undefined) return v === 1 ? one : (many ?? "");
    if (v === undefined) return "";
    if (fmt === "pct" && typeof v === "number") return String(Math.round(v * 100));
    if (fmt === "champion" && typeof v === "number") return championName(v);
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
