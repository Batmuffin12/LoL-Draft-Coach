import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusHeader } from "../src/renderer/components/StatusHeader";
import { findConfigDir, loadConfig } from "../src/main/config";
import { filledShareId } from "../src/main/pick-card";
import { uiCopy } from "../src/main/personal-coach";
import { closeHighlight, draftHighlights, highlightVisit, LOBBY_TOUR, moveTour, placeCallout, placeNote, screenFor, skipStep, spotlight, startTour, stepKey, tourRunning, tourSteps, type TourStep } from "../src/renderer/first-use";
import { HIGHLIGHT_IDS, isHighlightId } from "../src/shared/ui-state";
import type { AccountView, DraftView, MyPickView } from "../src/shared/view";

const registered = { state: "registered" } as AccountView;
const draft = {} as DraftView;
const pick = {} as MyPickView;
const fresh = { tourDone: false, highlightsSeen: [] };
const done = { tourDone: true, highlightsSeen: [] };

describe("screenFor", () => {
  it("is the lobby once registered, also without an account (development mode)", () => {
    expect(screenFor({ account: registered, draft: null, myPick: null })).toBe("lobby");
    expect(screenFor({ account: null, draft: null, myPick: null })).toBe("lobby");
  });

  it.each(["unregistered", "registering", "mismatch", "error"] as const)("never blocks Connect: %s", (state) => {
    expect(screenFor({ account: { state } as AccountView, draft: null, myPick: null })).toBe("connect");
  });

  it("gives way to a draft and your pick", () => {
    expect(screenFor({ account: registered, draft, myPick: null })).toBe("champSelect");
    expect(screenFor({ account: null, draft, myPick: null })).toBe("champSelect");
    expect(screenFor({ account: registered, draft, myPick: pick })).toBe("lockedIn");
    expect(screenFor({ account: registered, draft: null, myPick: pick })).toBe("lockedIn");
  });
});

describe("tourRunning", () => {
  it("runs the first time, and from the footer", () => {
    expect(tourRunning(fresh, false, false)).toBe(true);
    expect(tourRunning(done, false, false)).toBe(false);
    expect(tourRunning(done, true, false)).toBe(true);
  });

  it("stops at once when closed, before the saved state is back", () => {
    expect(tourRunning(fresh, false, true)).toBe(false);
  });

  it("a draft doesn't mark it done: leaving the lobby hides it, and it is still running after", () => {
    const during = { account: registered, draft, myPick: null };
    expect(screenFor(during)).toBe("champSelect");
    expect(tourRunning(fresh, false, false)).toBe(true);
    const moved = moveTour(startTour(), 1, LOBBY_TOUR.length)!;
    expect(moved.index).toBe(1);
  });
});

describe("the lobby tour's steps", () => {
  it("is four steps, the most important first, ending on how to see it again", () => {
    expect(LOBBY_TOUR.map((s) => s.id)).toEqual(["intro", "window", "tabs", "footer"]);
    expect(LOBBY_TOUR[0]!.target).toBeUndefined();
    expect(LOBBY_TOUR.at(-1)!.target).toBe("how-it-works");
  });

  it("the dock step's ring is on the very button it speaks of, the first of the window buttons, and says what it does now", () => {
    const step = LOBBY_TOUR.find((s) => s.id === "window")!;
    expect(step.target).toBe("dock");
    const html = renderToStaticMarkup(createElement(StatusHeader, { lcu: "connected", docked: true, onDock: () => {}, onMinimize: () => {}, onClose: () => {} }));
    const buttons = html.split('class="window-buttons"')[1]!;
    expect(buttons.indexOf('data-tour="dock"')).toBeLessThan(buttons.indexOf("<button", buttons.indexOf("<button") + 1));
    expect(stepKey(step, false)).toBe("window");
    expect(stepKey(step, true)).toBe("window.docked");
    expect(stepKey(LOBBY_TOUR[0]!, true)).toBe("intro");
  });

  it("the last step's \"this link\" is the link it rings", () => {
    expect(LOBBY_TOUR.at(-1)!.target).toBe("how-it-works");
    const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
    expect(copy["tour.footer"]).toContain("this link");
  });

  it("leaves out a step already found to have no target", () => {
    expect(tourSteps(LOBBY_TOUR, ["tabs"]).map((s) => s.id)).toEqual(["intro", "window", "footer"]);
  });
});

describe("moving through the tour", () => {
  it("moves on and back, stops at the first, and ends past the last", () => {
    const at1 = moveTour(startTour(), 1, 3)!;
    expect(at1.index).toBe(1);
    expect(moveTour(at1, -1, 3)!.index).toBe(0);
    expect(moveTour(startTour(), -1, 3)!.index).toBe(0);
    expect(moveTour({ index: 2, dir: 1, skipped: [] }, 1, 3)).toBeNull();
  });

  const steps: TourStep[] = [{ id: "a" }, { id: "b", target: "gone" }, { id: "c" }];
  const list = (skipped: string[]) => tourSteps(steps, skipped);

  it("going forward, passes a step without a target to the next", () => {
    const run = skipStep({ index: 1, dir: 1, skipped: [] }, "b");
    expect(list(run.skipped)[run.index]!.id).toBe("c");
  });

  it("going back, passes it to the one before", () => {
    const run = skipStep({ index: 1, dir: -1, skipped: [] }, "b");
    expect(list(run.skipped)[run.index]!.id).toBe("a");
  });

});

describe("placing the callout", () => {
  const view = { width: 440, height: 720 };
  const size = { width: 300, height: 80 };
  const inside = (p: { top: number; left: number }) => {
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top + size.height).toBeLessThanOrEqual(view.height);
    expect(p.left + size.width).toBeLessThanOrEqual(view.width);
  };

  it("goes in the middle without a target", () => {
    expect(placeCallout(null, size, view)).toEqual({ top: 320, left: 70, side: "centre" });
  });

  it("goes under its target when there's room", () => {
    const p = placeCallout({ top: 40, left: 100, width: 40, height: 30 }, size, view);
    expect(p.side).toBe("below");
    expect(p.top).toBe(78);
    inside(p);
  });

  it("flips above a target at the bottom", () => {
    const p = placeCallout({ top: 680, left: 20, width: 80, height: 20 }, size, view);
    expect(p.side).toBe("above");
    expect(p.top).toBe(592);
    inside(p);
  });

  it("stays inside the window sideways", () => {
    inside(placeCallout({ top: 10, left: 0, width: 10, height: 10 }, size, view));
    inside(placeCallout({ top: 10, left: 430, width: 10, height: 10 }, size, view));
  });

  it("stays inside the window with a target as tall as it", () => {
    inside(placeCallout({ top: 0, left: 0, width: 440, height: 720 }, size, view));
    inside(placeCallout({ top: 30, left: 0, width: 440, height: 650 }, size, view));
  });

  it("keeps the spotlight inside the window, with room around the target", () => {
    expect(spotlight({ top: 100, left: 100, width: 50, height: 20 }, view)).toEqual({ top: 96, left: 96, width: 58, height: 28 });
    expect(spotlight({ top: 0, left: 0, width: 440, height: 720 }, view)).toEqual({ top: 0, left: 0, width: 440, height: 720 });
  });
});

describe("placing a live note", () => {
  const view = { width: 440, height: 720 };
  const size = { width: 424, height: 40 };
  const box = (top: number, height: number) => ({ top, left: 16, width: 408, height });

  it("goes to the bottom edge, over the footer's line, when that's off its target and block", () => {
    expect(placeNote({ target: box(100, 60), about: box(90, 300), footer: null, size, view }).top).toBe(672);
  });

  it("stays above a footer with a button in it, which it would otherwise cover", () => {
    expect(placeNote({ target: box(100, 30), about: box(90, 300), footer: box(640, 80), size, view }).top).toBe(594);
  });

  it("explaining the footer's own button, sits right above it", () => {
    const button = box(650, 32);
    expect(placeNote({ target: button, about: button, footer: box(640, 80), size, view }).top).toBe(594);
  });

  it("goes under the block when the bottom edge is on it", () => {
    expect(placeNote({ target: box(100, 60), about: box(90, 610), footer: null, size: { width: 424, height: 10 }, view }).top).toBeGreaterThan(90 + 610 - 1);
  });

  it("never goes on a footer it must stay off, even when its block fills the screen above", () => {
    expect(placeNote({ target: box(100, 30), about: box(90, 535), footer: box(625, 95), size, view }).top).toBe(579);
  });

  it("goes over the block when there's no room under it", () => {
    expect(placeNote({ target: box(660, 20), about: box(650, 40), footer: null, size, view }).top).toBe(604);
  });

  it("with no free place at all, stays in the window at the bottom", () => {
    const p = placeNote({ target: box(0, 720), about: box(0, 720), footer: null, size, view });
    expect(p.top).toBe(672);
    expect(p.left).toBe(8);
  });
});

describe("live highlights", () => {
  const all = () => true;

  it("names each screen's", () => {
    expect(draftHighlights({ banning: true, loadout: false })).toEqual(["bans"]);
    expect(draftHighlights({ banning: false, loadout: false })).toEqual(["picks", "chance"]);
    expect(draftHighlights({ banning: false, loadout: true })).toEqual(["rune-options", "import", "rough"]);
  });

  it("shows the first not seen, and none when all are", () => {
    expect(highlightVisit(null, ["a", "b"], [], all).current).toBe("a");
    expect(highlightVisit(null, ["a", "b"], ["a"], all).current).toBe("b");
    expect(highlightVisit(null, ["a", "b"], ["a", "b"], all).current).toBeNull();
  });

  it("passes one whose target isn't on screen, and doesn't count it as closed", () => {
    const v = highlightVisit(null, ["a", "b"], [], (id) => id === "b");
    expect(v.current).toBe("b");
    expect(v.closed).toEqual([]);
  });

  it("stays once saved as seen, while it's showing", () => {
    const v = highlightVisit(null, ["a"], [], all);
    expect(highlightVisit(v, ["a"], ["a"], all)).toBe(v);
  });

  it("goes when its target does", () => {
    const v = highlightVisit(null, ["a"], [], all);
    expect(highlightVisit(v, ["a"], [], () => false).current).toBeNull();
  });

  it("a click closes it for good on this screen, and the next may show", () => {
    const v = closeHighlight(highlightVisit(null, ["a", "b"], [], all));
    expect(v.current).toBeNull();
    expect(highlightVisit(v, ["a", "b"], [], all).current).toBe("b");
    const both = closeHighlight(highlightVisit(v, ["a", "b"], [], all));
    expect(highlightVisit(both, ["a", "b"], [], all).current).toBeNull();
  });

  it("another screen starts over, without what was closed on the last", () => {
    const v = closeHighlight(highlightVisit(null, ["a"], [], all));
    expect(highlightVisit(v, ["b"], [], all)).toEqual({ key: "b", current: "b", closed: [] });
  });

  it("only takes known ids from the renderer", () => {
    for (const id of HIGHLIGHT_IDS) expect(isHighlightId(id)).toBe(true);
    expect(isHighlightId("nope")).toBe(false);
    expect(isHighlightId(1)).toBe(false);
  });
});

describe("being filled", () => {
  it("never says only 0%", () => {
    expect(filledShareId(0)).toBe("picks.filled.share.none");
    expect(filledShareId(0.004)).toBe("picks.filled.share.few");
    expect(filledShareId(0.12)).toBe("picks.filled.share");
  });
});

describe("first-use wording", () => {
  const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
  const keys = [
    ...HIGHLIGHT_IDS.map((id) => `tour.live.${id}`),
    ...["reopen", "skip", "back", "next", "done"].map((k) => `tour.${k}`),
    ...LOBBY_TOUR.flatMap((s) => [`tour.${s.id}.lead`, `tour.${s.id}`, ...(s.end ? [`tour.${s.id}.end`] : []), ...(s.dock ? [`tour.${s.id}.docked.lead`, `tour.${s.id}.docked`] : [])]),
  ];

  it("has every key", () => {
    for (const key of keys) expect(copy[key], key).toBeTruthy();
  });

  it("quotes no numbers: none came from the engine", () => {
    for (const key of keys) expect(copy[key], key).not.toMatch(/\d/);
  });

  it("keeps it to a short line", () => {
    for (const key of keys) expect(copy[key]!.length, key).toBeLessThanOrEqual(130);
  });

  it("keeps the compliance wording, each where it applies", () => {
    expect(copy["tour.intro.end"]).toContain("It never picks, bans or locks");
    expect(copy["tour.live.import"]).toContain("only when you click");
    expect(copy["tour.live.browse"]).toContain("never shows other players' names or ranks");
  });

  it("claims no privacy it doesn't have: your games are on the server too, and backups outlive a delete", () => {
    for (const [key, text] of Object.entries(copy)) expect(text, key).not.toMatch(/kept on this PC|stays? on (this|your) PC|only on (this|your) PC/i);
    expect(copy["account.delete.ask"]).not.toMatch(/everything/);
    expect(copy["account.delete.ask"]).toContain("backups");
  });
});
