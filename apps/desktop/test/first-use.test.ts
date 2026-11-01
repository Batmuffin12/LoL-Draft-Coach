import { describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { draftHint, lobbyHint, nextVisit, screenFor, tourStep, TOUR_CARDS } from "../src/renderer/first-use";
import { HINT_IDS, isHintId } from "../src/shared/ui-state";
import type { AccountView, DraftView, MyPickView } from "../src/shared/view";

const registered = { state: "registered" } as AccountView;
const draft = {} as DraftView;
const pick = {} as MyPickView;
const fresh = { tourDone: false, hintsSeen: [] };
const done = { tourDone: true, hintsSeen: [] };

describe("screenFor", () => {
  it("shows the tour once registered, and the lobby after it", () => {
    expect(screenFor({ account: registered, draft: null, myPick: null, ui: fresh }, false)).toBe("tour");
    expect(screenFor({ account: registered, draft: null, myPick: null, ui: done }, false)).toBe("lobby");
  });

  it("works without an account (development mode)", () => {
    expect(screenFor({ account: null, draft: null, myPick: null, ui: fresh }, false)).toBe("tour");
    expect(screenFor({ account: null, draft: null, myPick: null, ui: done }, false)).toBe("lobby");
    expect(screenFor({ account: null, draft, myPick: null, ui: fresh }, false)).toBe("champSelect");
  });

  it.each(["unregistered", "registering", "mismatch", "error"] as const)("never blocks Connect: %s", (state) => {
    const account = { state } as AccountView;
    expect(screenFor({ account, draft: null, myPick: null, ui: fresh }, false)).toBe("connect");
    expect(screenFor({ account, draft: null, myPick: null, ui: done }, true)).toBe("connect");
  });

  it("gives way to a draft, also when opened from the footer, and comes back after", () => {
    expect(screenFor({ account: registered, draft, myPick: null, ui: fresh }, false)).toBe("champSelect");
    expect(screenFor({ account: registered, draft, myPick: null, ui: done }, true)).toBe("champSelect");
    expect(screenFor({ account: registered, draft, myPick: pick, ui: fresh }, false)).toBe("lockedIn");
    expect(screenFor({ account: registered, draft: null, myPick: pick, ui: fresh }, false)).toBe("lockedIn");
    expect(screenFor({ account: registered, draft: null, myPick: null, ui: fresh }, false)).toBe("tour");
  });

  it("reopens from the footer", () => {
    expect(screenFor({ account: registered, draft: null, myPick: null, ui: done }, true)).toBe("tour");
  });
});

describe("tourStep", () => {
  it("stays within the cards", () => {
    expect(tourStep(0, -1)).toBe(0);
    expect(tourStep(0, 1)).toBe(1);
    expect(tourStep(TOUR_CARDS.length - 1, 1)).toBe(TOUR_CARDS.length - 1);
  });
});

describe("hints", () => {
  it("opens on a first visit, not when seen", () => {
    expect(nextVisit(null, "me", [])).toEqual({ id: "me", open: true });
    expect(nextVisit(null, "me", ["me"])).toEqual({ id: "me", open: false });
    expect(nextVisit(null, null, [])).toEqual({ id: null, open: false });
  });

  it("stays open once saved as seen, while on the same screen", () => {
    const visit = nextVisit(null, "me", []);
    expect(nextVisit(visit, "me", ["me"])).toBe(visit);
  });

  it("stays closed on the same screen after dismissing", () => {
    const dismissed = { id: "me", open: false } as const;
    expect(nextVisit(dismissed, "me", [])).toBe(dismissed);
  });

  it("is gone when you come back to the screen", () => {
    const left = nextVisit(nextVisit(null, "me", []), "last", ["me"]);
    expect(left).toEqual({ id: "last", open: true });
    expect(nextVisit(left, "me", ["me", "last"])).toEqual({ id: "me", open: false });
  });

  it("opens again on a later visit when it had no room and was never seen", () => {
    const noRoom = { id: "pick", open: false } as const;
    const banning = nextVisit(noRoom, "ban", []);
    expect(nextVisit(banning, "pick", ["ban"])).toEqual({ id: "pick", open: true });
  });

  it("names each screen's hint", () => {
    expect(lobbyHint("last")).toBe("last");
    expect(lobbyHint("me")).toBe("me");
    expect(lobbyHint("champions")).toBe("champions");
    expect(lobbyHint("suggestion")).toBeNull();
    expect(draftHint({ banning: true, loadout: false, canImport: false })).toBe("ban");
    expect(draftHint({ banning: false, loadout: false, canImport: false })).toBe("pick");
    expect(draftHint({ banning: false, loadout: true, canImport: true })).toBe("locked");
    expect(draftHint({ banning: false, loadout: true, canImport: false })).toBeNull();
  });

  it("only takes known ids from the renderer", () => {
    for (const id of HINT_IDS) expect(isHintId(id)).toBe(true);
    expect(isHintId("nope")).toBe(false);
    expect(isHintId(1)).toBe(false);
  });
});

describe("first-use wording", () => {
  const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
  const keys = [
    ...HINT_IDS.map((id) => `hint.${id}`),
    ...["reopen", "skip", "back", "next", "done"].map((k) => `tour.${k}`),
    ...TOUR_CARDS.flatMap((c, i) => {
      const card = `tour.card${i + 1}`;
      const lines = Array.from({ length: c.lines }, (_, l) => [`${card}.line${l + 1}.lead`, `${card}.line${l + 1}`]).flat();
      return [`${card}.title`, ...lines, ...(c.note ? [`${card}.note.lead`, `${card}.note`] : [])];
    }),
  ];

  it("has every key", () => {
    for (const key of keys) expect(copy[key], key).toBeTruthy();
  });

  it("quotes no numbers: none came from the engine", () => {
    for (const key of keys) expect(copy[key], key).not.toMatch(/\d/);
  });

  it("keeps hints to one short line", () => {
    for (const id of HINT_IDS) expect(copy[`hint.${id}`]!.length, id).toBeLessThanOrEqual(90);
  });
});
