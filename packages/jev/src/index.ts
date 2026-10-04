/**
 * Jev (TypeSafe AI) decision adapter — interface, mock and fallback only.
 *
 * TODO(jev): implement a real JevAdapter once there is an API key and official docs.
 * Do not guess the API. Until then the feature flag (JEV_ENABLED) stays off and
 * createJevAdapter() returns the disabled adapter, so the engine's ranking is always used.
 */

/** A typed question. Options are built per request from current data, never hardcoded. */
export type JevQuestion =
  | { kind: "one_of"; id: string; prompt: string; options: string[]; state: Record<string, unknown> }
  | { kind: "yes_no"; id: string; prompt: string; state: Record<string, unknown> }
  | { kind: "score"; id: string; prompt: string; min: number; max: number; state: Record<string, unknown> };

export type JevAnswer<Q extends JevQuestion> = Q extends { kind: "one_of" } ? string : Q extends { kind: "yes_no" } ? boolean : number;

export interface JevDecision<T> {
  answer: T;
  /** Model probability of the answer, 0..1. */
  probability: number;
  /** Model confidence, 0..1. */
  confidence: number;
}

export interface JevAdapter {
  readonly available: boolean;
  decide<Q extends JevQuestion>(question: Q): Promise<JevDecision<JevAnswer<Q>>>;
}

export class JevUnavailableError extends Error {}

/** Used whenever the flag is off or Jev isn't configured. */
export class DisabledJev implements JevAdapter {
  readonly available = false;
  async decide<Q extends JevQuestion>(_question: Q): Promise<JevDecision<JevAnswer<Q>>> {
    throw new JevUnavailableError("Jev is disabled (JEV_ENABLED=false or no JEV_API_KEY)");
  }
}

export interface JevSettings {
  enabled: boolean;
  apiKey: string | null;
}

/** Returns the adapter for the current settings. The real client is a TODO, so this is always disabled for now. */
export function createJevAdapter(settings: JevSettings): JevAdapter {
  if (!settings.enabled || !settings.apiKey) return new DisabledJev();
  // TODO(jev): return new HttpJev(settings) once the API is documented.
  return new DisabledJev();
}

/** Ensures a "none of these" escape option is present (Jev always picks a listed option). */
export function withNoneOption(options: string[], noneLabel = "none of these"): string[] {
  return options.some((o) => o.toLowerCase() === noneLabel.toLowerCase()) ? options : [...options, noneLabel];
}

export interface Decided<T> {
  answer: T;
  source: "jev" | "engine";
  confidence: number | null;
  /** "clear" at/above the clear threshold, "close" between threshold and clear, null for engine fallback. */
  label: "clear" | "close" | null;
}

export interface Thresholds {
  /** Below this, Jev's answer is ignored and the engine's answer is used. */
  act: number;
  /** At/above this, the decision is shown as a "clear pick". */
  clear: number;
}

/**
 * Asks Jev and acts only above the confidence threshold; otherwise (or on any error)
 * falls back to the engine's answer. A "none of these" answer also falls back.
 */
export async function decideWithFallback<Q extends JevQuestion>(
  jev: JevAdapter,
  question: Q,
  engineAnswer: JevAnswer<Q>,
  thresholds: Thresholds,
  isNone: (answer: JevAnswer<Q>) => boolean = () => false,
): Promise<Decided<JevAnswer<Q>>> {
  const fallback: Decided<JevAnswer<Q>> = { answer: engineAnswer, source: "engine", confidence: null, label: null };
  if (!jev.available) return fallback;
  try {
    const d = await jev.decide(question);
    if (d.confidence < thresholds.act || isNone(d.answer)) return fallback;
    return { answer: d.answer, source: "jev", confidence: d.confidence, label: d.confidence >= thresholds.clear ? "clear" : "close" };
  } catch {
    return fallback;
  }
}

/** Scripted Jev for tests. */
export class MockJev implements JevAdapter {
  readonly available = true;
  readonly asked: JevQuestion[] = [];
  constructor(private readonly respond: (q: JevQuestion) => JevDecision<unknown> | Error) {}
  async decide<Q extends JevQuestion>(question: Q): Promise<JevDecision<JevAnswer<Q>>> {
    this.asked.push(question);
    const r = this.respond(question);
    if (r instanceof Error) throw r;
    return r as JevDecision<JevAnswer<Q>>;
  }
}
