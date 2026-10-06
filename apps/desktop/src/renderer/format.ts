import type { Term, TermName } from "@ldc/shared";
import type { ReasonView } from "../shared/view";

/** Joins class names, skipping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** A chance as a whole percent: 0.537 → "54%". */
export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
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

/** "middle" → "Middle" (positions as the client names them). */
export function positionLabel(position: string): string {
  return position ? position[0]!.toUpperCase() + position.slice(1) : "";
}

/** Two letters for an icon without an image: "Lee Sin" → "LS", "Ahri" → "Ah". */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean);
  if (parts.length > 1) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  const one = parts[0] ?? "?";
  return one.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

export const TERM_LABEL: Record<TermName, string> = {
  meta: "Meta",
  lane: "Matchup",
  counter: "Counters",
  synergy: "Synergy",
  team: "Team needs",
  personal: "You on it",
};

/** The n biggest terms by size, always keeping the biggest negative one as the caveat. */
export function topTerms(terms: Term[], n: number): Term[] {
  const all = terms.filter((t) => Math.round(t.deltaWin * 1000) !== 0).sort((a, b) => Math.abs(b.deltaWin) - Math.abs(a.deltaWin));
  const top = all.slice(0, n);
  const worst = all.filter((t) => t.deltaWin < 0).sort((a, b) => a.deltaWin - b.deltaWin)[0];
  if (worst && !top.includes(worst) && n > 1) return [...top.slice(0, n - 1), worst];
  return top;
}

/** Too few games behind a term for it to count: drawn faint. Terms without games (team needs) never are. */
export function thinTerm(term: Term, minGames: { meta: number; pair: number } | undefined): boolean {
  if (!minGames || term.games === 0) return false;
  if (term.name === "meta") return term.games < minGames.meta;
  if (term.name === "lane" || term.name === "counter" || term.name === "synergy") return term.games < minGames.pair;
  return false;
}

/** The reasons to show in limited room: the strongest ones, and the caveat if there is one. */
export function pickReasons(reasons: ReasonView[], max: number): ReasonView[] {
  const caveat = reasons.find((r) => r.negative);
  if (!caveat || max < 2) return reasons.slice(0, max);
  return [...reasons.filter((r) => !r.negative).slice(0, max - 1), caveat];
}
