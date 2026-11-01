import type { HintId } from "../shared/ui-state";
import type { ViewState } from "../shared/view";

export type Screen = "connect" | "lockedIn" | "champSelect" | "tour" | "lobby";

/**
 * The screen for the moment. Connect first: the tour never stands in its way. A draft or your locked-in
 * pick comes before the tour, which waits (not done) and comes back afterwards. `tourOpen`: reopened from the footer.
 */
export function screenFor(state: Pick<ViewState, "account" | "draft" | "myPick" | "ui">, tourOpen: boolean): Screen {
  const { account, draft, myPick, ui } = state;
  if (account && account.state !== "registered") return "connect";
  if (myPick) return "lockedIn";
  if (draft) return "champSelect";
  return !ui.tourDone || tourOpen ? "tour" : "lobby";
}

/** The tour's cards; their wording is "ui.tour.card<n>.*" in the explain config. */
export const TOUR_CARDS: { lines: number; numbered?: boolean; note?: boolean }[] = [{ lines: 3 }, { lines: 4, numbered: true }, { lines: 3 }, { lines: 3, note: true }];

/** Which card an action leads to: stays within the cards. */
export function tourStep(step: number, delta: number): number {
  return Math.max(0, Math.min(TOUR_CARDS.length - 1, step + delta));
}

/** One visit to a screen and its hint: open while it is on screen; a hint already seen doesn't open. */
export interface HintVisit {
  id: HintId | null;
  open: boolean;
}

/**
 * The visit once the screen is `id`. The same screen stays as it is, also after its hint was saved
 * as seen: that happens while it is showing. Another screen starts a new visit, and the same object means no change.
 */
export function nextVisit(visit: HintVisit | null, id: HintId | null, seen: readonly string[]): HintVisit {
  if (visit && visit.id === id) return visit;
  return { id, open: id !== null && !seen.includes(id) };
}

/** The hint of a lobby tab. Next game has none: it says what it is. */
export function lobbyHint(tab: "suggestion" | "last" | "me" | "champions"): HintId | null {
  return tab === "suggestion" ? null : tab;
}

/** The hint in champ select. On a loadout it is about importing, so only when that can be done. */
export function draftHint(d: { banning: boolean; loadout: boolean; canImport: boolean }): HintId | null {
  if (d.loadout) return d.canImport ? "locked" : null;
  return d.banning ? "ban" : "pick";
}
