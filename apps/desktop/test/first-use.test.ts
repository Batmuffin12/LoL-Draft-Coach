import { describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { closeHighlight, draftHighlights, highlightVisit, LOBBY_TOUR, moveTour, openAt, placeCallout, screenFor, skipStep, spotlight, startTour, tourRunning, tourSteps, type TourStep } from "../src/renderer/first-use";
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
  const onlyHas = (subs: string[]) => (_tab: string, sub: string) => subs.includes(sub);

  it("leaves out sub-tabs the lobby doesn't have, so no dot stands for nothing", () => {
    const ids = tourSteps(LOBBY_TOUR, onlyHas(["style", "pool"]), []).map((s) => s.id);
    expect(ids).not.toContain("browse");
    expect(ids).not.toContain("my-games");
    expect(ids).toContain("champions");
  });

  it("includes them once the lobby has them", () => {
    const ids = tourSteps(LOBBY_TOUR, onlyHas(["style", "pool", "browse", "my-games"]), []).map((s) => s.id);
    expect(ids).toContain("browse");
    expect(ids).toContain("my-games");
  });

  it("starts centred and ends centred", () => {
    expect(LOBBY_TOUR[0]!.target).toBeUndefined();
    expect(LOBBY_TOUR.at(-1)!.target).toBeUndefined();
  });

  it("the numbers step falls back to the middle, other targets to being skipped", () => {
    expect(LOBBY_TOUR.find((s) => s.id === "numbers")!.orCentre).toBe(true);
    expect(LOBBY_TOUR.find((s) => s.id === "browse")!.orCentre).toBeUndefined();
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
  const list = (skipped: string[]) => tourSteps(steps, () => true, skipped);

  it("going forward, passes a step without a target to the next", () => {
    const run = skipStep({ index: 1, dir: 1, skipped: [] }, "b");
    expect(list(run.skipped)[run.index]!.id).toBe("c");
  });

  it("going back, passes it to the one before", () => {
    const run = skipStep({ index: 1, dir: -1, skipped: [] }, "b");
    expect(list(run.skipped)[run.index]!.id).toBe("a");
  });

  it("shows the last thing opened up to a step, or nothing before the first", () => {
    const open = { tab: "me" } as const;
    const s: TourStep[] = [{ id: "a" }, { id: "b", open }, { id: "c" }];
    expect(openAt(s, 0)).toBeNull();
    expect(openAt(s, 1)).toEqual(open);
    expect(openAt(s, 2)).toEqual(open);
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

describe("live highlights", () => {
  const all = () => true;

  it("names each screen's", () => {
    expect(draftHighlights({ banning: true, loadout: false })).toEqual(["bans"]);
    expect(draftHighlights({ banning: false, loadout: false })).toEqual(["picks"]);
    expect(draftHighlights({ banning: false, loadout: true })).toEqual(["rune-options", "import"]);
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

describe("first-use wording", () => {
  const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
  const keys = [
    ...HIGHLIGHT_IDS.map((id) => `tour.live.${id}`),
    ...["reopen", "skip", "back", "next", "done"].map((k) => `tour.${k}`),
    ...LOBBY_TOUR.flatMap((s) => [`tour.${s.id}.lead`, `tour.${s.id}`]),
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
});
