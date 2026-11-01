import type { CoachStatus, Term } from "@ldc/shared";
import { FALLBACK_MIN_GAMES, type ReasonView, type ViewState } from "../shared/view";

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

/** Signed points, or "—" when there is no number. */
export function signedOrDash(x: number | null | undefined): string {
  return x == null ? "—" : signed(x);
}

/** Games for a table: "1,240", and "12k" above 10,000. */
export function games(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : count(n);
}

/** "1 game", "12 games", "12k games": the raw number picks the word. */
export function gameCount(n: number): string {
  return t("count.games", { games: games(n), n });
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

let minGames = FALLBACK_MIN_GAMES;

/** Sets the shared minimum from the view state (config app.display.minGames). */
export function setMinGames(n: number): void {
  minGames = n;
}

/** Too few games to read much into their win rate. */
export function isThin(games: number): boolean {
  return games < minGames;
}

/** A win rate with the games behind it: whole below the shared minimum, else with `digits`. */
export function rateOf(x: number | null | undefined, games: number, digits = 1): string {
  return rate(x, isThin(games) ? 0 : digits);
}

/** winTone with the games behind it: neutral below the shared minimum. */
export function winToneOf(x: number | null | undefined, games: number): "pos" | "neg" | "flat" {
  return isThin(games) ? "flat" : winTone(x);
}

/** Points of win chance without a sign, for sentences that already say which way: −0.012 → "1.2". */
export function points(x: number): string {
  return Math.abs(Math.round(x * 1000) / 10).toFixed(1);
}

/** The same number as signed points, in wins: 0.012 → "about 1 more win per 100 games". Empty without a number. */
export function winsPer100(x: number | null | undefined): string {
  if (x == null) return "";
  const per = 100;
  const n = Math.round(Math.abs(x) * per);
  return n === 0 ? t("units.under", { per }) : t(x > 0 ? "units.more" : "units.fewer", { n, per });
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago". */
export function ago(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 1) return t("time.justNow");
  if (min < 60) return t("time.minutes", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("time.hours", { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t("time.yesterday") : t("time.days", { n: d });
}

/** Thousands separators: 1240 → "1,240". */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

let copy: Record<string, string> = {};

/** Sets the panel's fixed wording from the view state (the explain config's "ui.*" templates). */
export function setCopy(c: Record<string, string>): void {
  copy = c;
}

/**
 * Fixed panel wording by key ("connect.title"), with {slot} values filled in and {n|one|many}
 * plurals. The key itself when the config doesn't have it (it shows, rather than nothing).
 */
export function t(key: string, slots: Record<string, string | number> = {}): string {
  const text = copy[key] ?? key;
  return text.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_all, k: string, one?: string, many?: string) => {
    const v = slots[k];
    if (one !== undefined) return v === 1 ? one : (many ?? "");
    return v === undefined ? "" : String(v);
  });
}

/**
 * The loading line for your games, or null. No count while nothing is known yet ("0 of 0" reads as
 * stuck), and none for the older games either: that number only changes when the panel asks again.
 */
export function profileProgress(profile: CoachStatus["profile"]): { text: string; done?: number; total?: number } | null {
  if ((profile.state === "loading" || profile.state === "ready") && profile.waking) return { text: t("profile.waking") };
  if (profile.state === "loading") {
    const { done, total } = profile;
    return total > 0 ? { text: t("profile.loading", { done, total }), done, total } : { text: t("profile.checking") };
  }
  return profile.state === "ready" && profile.backlog ? { text: t("profile.older") } : null;
}

/** Your games can't load until the League client opens: it isn't open, and nothing is saved on this PC. */
export function needsClient(status: CoachStatus): boolean {
  const { profile } = status;
  return status.lcu !== "connected" && (profile.state === "idle" || (profile.state === "ready" && profile.games === 0));
}

/** Why champ select has no pick to suggest, as a copy key: the actual cause, never a promise that can't come true. */
export function noPicksKey(state: Pick<ViewState, "unsupportedQueue" | "status">): string {
  if (state.unsupportedQueue) return "pick.empty.queue";
  const p = state.status.profile.state;
  return p === "error" ? "pick.empty.error" : p === "loading" ? "pick.empty.loading" : p === "idle" ? "pick.empty.idle" : "pick.empty.none";
}

/** Why champ select has no ban to suggest, as a copy key: bans need the live meta first, then your games. */
export function noBansKey(state: Pick<ViewState, "unsupportedQueue" | "status" | "meta">): string {
  if (state.unsupportedQueue) return "ban.empty.queue";
  const { meta } = state;
  if (meta?.state === "error") return meta.noSnapshot ? "ban.empty.noSnapshot" : "ban.empty.metaError";
  if (meta?.state !== "ready") return "ban.empty.noMeta";
  const p = state.status.profile.state;
  return p === "error" ? "ban.empty.error" : p === "loading" ? "ban.empty.loading" : p === "idle" ? "ban.empty.idle" : "ban.empty.none";
}

/**
 * What a lobby tab says with nothing to show, by cause: open the client, your games failed to load,
 * they're still coming ("<tab>.loading"), or they're here and there's nothing to show ("<tab>.empty").
 */
export function lobbyEmpty(status: CoachStatus, tab: string, slots: Record<string, string | number> = {}): string {
  if (needsClient(status)) return t("profile.openClient");
  const p = status.profile.state;
  if (p === "error") return t("profile.emptyError");
  return t(p === "ready" ? `${tab}.empty` : `${tab}.loading`, slots);
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

/**
 * The pick table's term columns, in points of win chance: lane (your lane opponent only, the same
 * number the matchup reason gives), you (personal), team (the rest of the draft: team needs,
 * duos with allies, and counters to their other picks); meta for the tooltip. Null: no such term.
 */
export function pickColumns(terms: Term[]): { lane: number | null; you: number | null; team: number | null; meta: number | null } {
  const out: { lane: number | null; you: number | null; team: number | null; meta: number | null } = { lane: null, you: null, team: null, meta: null };
  for (const t of terms) {
    const k = t.name === "lane" ? "lane" : t.name === "personal" ? "you" : t.name === "team" || t.name === "synergy" || t.name === "counter" ? "team" : "meta";
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

/** "v1.0.0", or "v1.0.0 → 1.0.1 on restart" once an update is downloaded; "" without a version. */
export function versionText(app: { version: string; updateReady: string | null }): string {
  if (!app.version) return "";
  return app.updateReady ? `v${app.version} → ${app.updateReady} on restart` : `v${app.version}`;
}
