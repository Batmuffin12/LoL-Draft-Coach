import { FALLBACK_MIN_GAMES, type ViewLimits } from "../shared/view";
import type { LoadedConfig } from "./config";
import { capital } from "./reason-view";

/** The panel's fixed wording: explain templates "ui.*", without the prefix. */
export function uiCopy(templates: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(templates).flatMap(([k, v]) => (k.startsWith("ui.") ? [[k.slice(3), v]] : [])));
}

/** Position names from the explain templates ("role.utility": "support"). */
export function roleLabels(templates: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(templates).flatMap(([k, v]) => (k.startsWith("role.") ? [[k.slice(5), v]] : [])));
}

/** "Mid", "Jungle": the role's label from config, capitalised. */
export function positionLabelFrom(templates: Record<string, string>, role: string): string {
  return capital(roleLabels(templates)[role] ?? role);
}

/** The numbers the panel's rules and wording need; an older server without the shared minimum falls back to the bundled one. */
export function viewLimits(config: LoadedConfig, bundled: LoadedConfig = config): ViewLimits {
  return {
    minGames: config.app.display?.minGames ?? bundled.app.display?.minGames ?? FALLBACK_MIN_GAMES,
    poolGames: config.engine.roleAdvice.minGames,
    styleGames: config.engine.playstyle.minGamesPerRole,
    monthDays: config.engine.report.days,
  };
}

/** A server's config, with wording it doesn't have yet (an older server) from the bundled copy, never raw ids. */
export function withBundledWording(config: LoadedConfig, bundled: LoadedConfig): LoadedConfig {
  const local = bundled.explain;
  return { ...config, explain: { ...config.explain, templates: { ...local.templates, ...config.explain.templates }, tips: { ...local.tips, ...config.explain.tips } } };
}
