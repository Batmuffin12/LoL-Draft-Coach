import type { Term } from "@ldc/shared";
import type { ReasonView } from "../shared/view";

/** Joins class names, skipping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** A chance as a whole percent: 0.537 → "54%". */
export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** A rate, or "—" when there is no number: 0.532 → "53%", with digits 1 → "53.2%". */
export function rate(x: number | null | undefined, digits = 0): string {
  return x == null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

/** A change in win chance as players read it: 0.021 → "+2.1%", −0.004 → "−0.4%". */
export function signedPct(x: number): string {
  return `${signed(x)}%`;
}

/** signedPct, or "—" when there is no number. */
export function signedPctOrDash(x: number | null | undefined): string {
  return x == null ? "—" : signedPct(x);
}

/** Signed points, or "—" when there is no number. */
export function signedOrDash(x: number | null | undefined): string {
  return x == null ? "—" : signed(x);
}

/** Games for a table: "1,240", and "12k" above 10,000. */
export function games(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : count(n);
}

/** Color class for points of win chance: "pos", "neg", or "flat" within ±deadZone (and for no number). */
export function tone(x: number | null | undefined, deadZone = 0.002): "pos" | "neg" | "flat" {
  return x == null || Math.abs(x) <= deadZone ? "flat" : x > 0 ? "pos" : "neg";
}

/** Color class for a win rate: from 50%, with a ±0.5 point dead zone. */
export function winTone(x: number | null | undefined): "pos" | "neg" | "flat" {
  return x == null ? "flat" : tone(x - 0.5, 0.005);
}

/** A change in win chance in points, signed with a true minus: 0.021 → "+2.1", -0.004 → "−0.4". */
export function signed(x: number): string {
  const v = Math.round(x * 1000) / 10;
  if (v === 0) return "0.0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
}

/** Thousands separators: 1240 → "1,240". */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

let roleNames: Record<string, string> = {};

/** Sets the position names from the view state (the explain config's "role.<id>" templates). */
export function setRoleLabels(labels: Record<string, string>): void {
  roleNames = labels;
}

/** A position as players know it, lower case for sentences: "utility" → "support", "middle" → "mid". */
export function roleName(position: string): string {
  return roleNames[position] ?? position;
}

/** A position as a label: "utility" → "Support", "middle" → "Mid". */
export function positionLabel(position: string): string {
  const name = roleName(position);
  return name ? name[0]!.toUpperCase() + name.slice(1) : "";
}

/** Two letters for an icon without an image: "Lee Sin" → "LS", "Ahri" → "Ah". */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean);
  if (parts.length > 1) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  const one = parts[0] ?? "?";
  return one.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

/** The pick table's term columns, in points of win chance: lane (lane + counter), you (personal), team (team + synergy); meta for the tooltip. Null: no such term. */
export function pickColumns(terms: Term[]): { lane: number | null; you: number | null; team: number | null; meta: number | null } {
  const out: { lane: number | null; you: number | null; team: number | null; meta: number | null } = { lane: null, you: null, team: null, meta: null };
  for (const t of terms) {
    const k = t.name === "lane" || t.name === "counter" ? "lane" : t.name === "personal" ? "you" : t.name === "team" || t.name === "synergy" ? "team" : "meta";
    out[k] = (out[k] ?? 0) + t.deltaWin;
  }
  return out;
}

/**
 * Skill per level 1–18 from the first three points and the max order: the ultimate at
 * 6, 11 and 16, the first three levels as given, then the first key in the max order that
 * isn't maxed (5 points; 3 for the ultimate). `ult` is the ultimate's key.
 */
export function skillPath(first: string[], order: string[], ult: string): string[] {
  const count = new Map<string, number>();
  const cap = (k: string) => (k === ult ? 3 : 5);
  const path: string[] = [];
  for (let level = 1; level <= 18; level++) {
    let k: string | undefined;
    if (level === 6 || level === 11 || level === 16) k = ult;
    else if (level <= 3 && first[level - 1]) k = first[level - 1];
    else k = order.find((o) => (count.get(o) ?? 0) < cap(o));
    k ??= ult;
    count.set(k, (count.get(k) ?? 0) + 1);
    path.push(k);
  }
  return path;
}

/** The reasons to show in limited room: the strongest ones, and the caveat if there is one. */
export function pickReasons(reasons: ReasonView[], max: number): ReasonView[] {
  const caveat = reasons.find((r) => r.negative);
  if (!caveat || max < 2) return reasons.slice(0, max);
  return [...reasons.filter((r) => !r.negative).slice(0, max - 1), caveat];
}
