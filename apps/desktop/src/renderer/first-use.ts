import type { HighlightId, UiState } from "../shared/ui-state";
import type { ViewState } from "../shared/view";

export type Screen = "connect" | "lockedIn" | "champSelect" | "lobby";

/** The screen for the moment. Connect first: the tour never stands in its way. A draft or your locked-in pick comes before the lobby, and so before its tour. */
export function screenFor(state: Pick<ViewState, "account" | "draft" | "myPick">): Screen {
  const { account, draft, myPick } = state;
  if (account && account.state !== "registered") return "connect";
  if (myPick) return "lockedIn";
  if (draft) return "champSelect";
  return "lobby";
}

/**
 * The lobby tour runs: the first time until it is finished or skipped (`closed`: just now, before the
 * saved state is back), or reopened from the footer. A draft only hides it, by leaving the lobby.
 */
export function tourRunning(ui: UiState, reopened: boolean, closed: boolean): boolean {
  return reopened || (!ui.tourDone && !closed);
}

/**
 * One step of the lobby tour. To add one: put `data-tour="<target>"` on the element and an entry here, with its
 * wording in "ui.tour.<id>.lead" and "ui.tour.<id>" in the explain config.
 */
export interface TourStep {
  id: string;
  /** The `data-tour` attribute to spotlight; none: a centred card. */
  target?: string;
  /** Ends on a second strong line ("ui.tour.<id>.end"). */
  end?: boolean;
}

/** Short on purpose: what it is, where it lives, the rest of the app, how to see this again. Everything else is a note on first use, where it applies. */
export const LOBBY_TOUR: TourStep[] = [
  { id: "intro", end: true },
  { id: "window", target: "window-buttons" },
  { id: "tabs", target: "tab-row" },
  { id: "footer", target: "how-it-works" },
];

/** The steps this tour has: without those already found to have no target. */
export function tourSteps(steps: readonly TourStep[], skipped: readonly string[]): TourStep[] {
  return steps.filter((s) => !skipped.includes(s.id));
}

/** Where the tour is. It lasts over a draft, so the tour picks up where it was. */
export interface TourRun {
  index: number;
  /** The way it last moved: a step without a target is passed in that direction. */
  dir: 1 | -1;
  skipped: string[];
}

export function startTour(): TourRun {
  return { index: 0, dir: 1, skipped: [] };
}

/** One step on or back; null past the last step: the tour is over. Back stops at the first. */
export function moveTour(run: TourRun, delta: 1 | -1, count: number): TourRun | null {
  const index = run.index + delta;
  if (index >= count) return null;
  return { ...run, index: Math.max(0, index), dir: delta };
}

/** The current step's target isn't on screen: pass it. The list gets shorter, so going on is the same index. */
export function skipStep(run: TourRun, id: string): TourRun {
  return { ...run, skipped: [...run.skipped, id], index: run.dir < 0 ? Math.max(0, run.index - 1) : run.index };
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The spotlight around a target: a little room around it, kept inside the window. */
export function spotlight(target: Box, view: { width: number; height: number }, pad = 4): Box {
  const top = Math.max(0, target.top - pad);
  const left = Math.max(0, target.left - pad);
  return {
    top,
    left,
    width: Math.min(view.width, target.left + target.width + pad) - left,
    height: Math.min(view.height, target.top + target.height + pad) - top,
  };
}

export type CalloutSide = "below" | "above" | "centre";

/** The callout inside the window: under its target, over it when there's no room, in the middle without a target. */
export function placeCallout(target: Box | null, size: { width: number; height: number }, view: { width: number; height: number }, gap = 8, margin = 8): { top: number; left: number; side: CalloutSide } {
  const clamp = (value: number, room: number) => Math.max(margin, Math.min(value, room - margin));
  if (!target) return { top: clamp((view.height - size.height) / 2, view.height - size.height), left: clamp((view.width - size.width) / 2, view.width - size.width), side: "centre" };
  const left = clamp(target.left + target.width / 2 - size.width / 2, view.width - size.width);
  const below = target.top + target.height + gap;
  const above = target.top - gap - size.height;
  const roomBelow = view.height - margin - below;
  const roomAbove = target.top - gap - margin;
  if (size.height <= roomBelow) return { top: below, left, side: "below" };
  if (size.height <= roomAbove) return { top: above, left, side: "above" };
  // A target as tall as the window: on the side with more room, overlapping it rather than leaving the window.
  return roomBelow >= roomAbove ? { top: clamp(below, view.height - size.height), left, side: "below" } : { top: clamp(above, view.height - size.height), left, side: "above" };
}

const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * Where a live note goes, so it covers neither its target nor the block it explains: first the window's bottom edge
 * (over the footer's line, or just above a footer with a button or Riot's notice in it), then under the block, then over
 * it if it's low on the screen (never on the tabs). With no such place (a block as tall as the window): the bottom edge anyway.
 */
export function placeNote(o: { target: Box; about: Box; footer: Box | null; size: { width: number; height: number }; view: { width: number; height: number } }, gap = 6, margin = 8): { top: number; left: number } {
  const { target, about, footer, size, view } = o;
  const left = margin;
  const bottom = (footer ? footer.top - gap : view.height - margin) - size.height;
  const fits = (top: number) => {
    const box = { top, left, width: size.width, height: size.height };
    return top >= margin && top + size.height <= view.height - margin && !overlaps(box, target) && !overlaps(box, about) && !(footer && overlaps(box, footer));
  };
  const over = about.top > view.height / 2 ? [about.top - gap - size.height] : [];
  const top = [bottom, about.top + about.height + gap, ...over].find(fits) ?? Math.max(margin, bottom);
  return { top, left };
}

/** The highlights for a live screen, in order. Those whose target isn't on screen (no second rune page, no import, no "rough guide") simply don't show. */
export function draftHighlights(d: { banning: boolean; loadout: boolean }): HighlightId[] {
  if (d.loadout) return ["rune-options", "import", "rough"];
  return d.banning ? ["bans"] : ["picks", "chance"];
}

/** Highlights on one screen: the one showing, and those closed since you got there. */
export interface HighlightVisit {
  key: string;
  current: string | null;
  closed: readonly string[];
}

/**
 * The visit as things stand. A highlight stays while its target does, also after it was saved as seen
 * (that happens while it shows). Otherwise the next one not seen, not closed, with its target on screen.
 * Another list of ids means another screen, and starts over. The same object means no change.
 */
export function highlightVisit(visit: HighlightVisit | null, ids: readonly string[], seen: readonly string[], onScreen: (id: string) => boolean): HighlightVisit {
  const key = ids.join();
  const same = visit?.key === key;
  if (same && visit.current && onScreen(visit.current)) return visit;
  const closed = same ? visit.closed : [];
  const current = ids.find((id) => !seen.includes(id) && !closed.includes(id) && onScreen(id)) ?? null;
  return same && visit.current === current ? visit : { key, current, closed };
}

/** You clicked something (or the ×): the highlight goes, and the next may show. */
export function closeHighlight(visit: HighlightVisit): HighlightVisit {
  return visit.current ? { ...visit, current: null, closed: [...visit.closed, visit.current] } : visit;
}
