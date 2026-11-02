// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { App } from "../src/renderer/App";
import { ErrorBoundary } from "../src/renderer/components/ErrorBoundary";
import { InviteCodeInput } from "../src/renderer/components/InviteCodeInput";
import { LOBBY_TOUR } from "../src/renderer/first-use";
import { setCopy, t } from "../src/renderer/format";
import { Browse, initialBrowse, type BrowseState } from "../src/renderer/screens/Browse";
import { LoadoutFooter } from "../src/renderer/screens/LockedInScreen";
import type { ExploreChampionView, ExploreList } from "../src/shared/explore";
import { emptyViewState, type AccountView, type DraftView, type LoadoutView, type MyPickView, type RunePageView, type ViewState } from "../src/shared/view";
import { button, cleanup, click, createElement, fakeCoach, fakeLayout, hasButton, key, render, rerender, selectedTabs, settle, type } from "./dom";

const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
const registered: AccountView = { state: "registered", riotId: "Me#EUW", serverUrl: "https://coach.test", defaultServerUrl: null, message: null };
const state = (over: Partial<ViewState> = {}): ViewState => ({ ...emptyViewState(), copy, account: registered, ui: { tourDone: true, highlightsSeen: [] }, ...over });

let coach: ReturnType<typeof fakeCoach>;
beforeEach(() => {
  setCopy(copy);
  coach = fakeCoach();
  fakeLayout();
});
afterEach(cleanup);

const startApp = async (s: ViewState) => {
  const container = await render(createElement(App));
  await coach.push(s);
  return container;
};

const champ = (id: number, name: string) => ({ id, name, iconUrl: null });
const page = (over: Partial<RunePageView> = {}): RunePageView => ({ key: "page-1", primary: { id: 8100, name: "Domination", iconUrl: null }, secondary: { id: 8200, name: "Sorcery", iconUrl: null }, runes: [{ id: 8112, name: "Electrocute", iconUrl: null }], shards: [], reason: null, primaryTree: null, secondaryTree: null, shardRows: null, situationalRunes: [], optionLabel: "Most taken", share: 0.7, winRate: 0.55, games: 300, ...over });
const loadout = (over: Partial<LoadoutView> = {}): LoadoutView => ({ games: 500, source: "Gold to Diamond", sourceAbove: true, thinNote: null, page: page(), pageAlt: null, spells: null, skills: null, starting: null, laterPool: [], laterNote: null, situational: [], quest: [], boots: null, items: [], commonPath: null, canImport: true, spikeSlots: [], ...over });
const myPick = (over: Partial<MyPickView> = {}): MyPickView => ({ champion: champ(103, "Ahri"), role: "middle", expectedWin: 0.52, reasons: [], loadout: loadout(), importLines: [], matchups: null, plan: [], ...over });
const draft = (over: Partial<DraftView> = {}): DraftView => ({ timerPhase: "BAN_PICK", timeLeftMs: 30_000, totalSeconds: 30, receivedAt: Date.now(), localAction: "pick", myTeam: [], theirTeam: [], myBans: [], theirBans: [], ...over }) as unknown as DraftView;

describe("which screen", () => {
  it("waits for the first state, then asks once and stops listening when it goes", async () => {
    const container = await render(createElement(App));
    expect(container.textContent).toContain("Starting");
    expect(coach.api.onState).toHaveBeenCalledOnce();
    await coach.push(state());
    expect(container.textContent).not.toContain("Starting");
    expect(selectedTabs()).toContain(t("tabs.me"));
  });

  it("goes to connect, to the draft and to your pick, and back to the lobby, as the state says", async () => {
    await startApp(state({ account: { ...registered, state: "unregistered", riotId: null } }));
    expect(document.querySelector(".connect-form")).not.toBeNull();
    await coach.push(state({ draft: draft() }));
    expect(document.querySelector(".connect-form")).toBeNull();
    expect(selectedTabs()).not.toContain(t("tabs.me"));
    await coach.push(state({ draft: draft(), myPick: myPick() }));
    expect(selectedTabs()).toEqual([t("runes.tab")]);
    await coach.push(state());
    expect(selectedTabs()).toContain(t("tabs.me"));
  });
});

describe("the lobby's tabs", () => {
  it("clicks through main tabs and sub-tabs, and each main tab remembers its sub-tab", async () => {
    await startApp(state());
    expect(selectedTabs()).toEqual([t("tabs.me"), t("tabs.style")]);
    await click(t("tabs.month"));
    expect(selectedTabs()).toEqual([t("tabs.me"), t("tabs.month")]);
    await click(t("tabs.champions"));
    expect(selectedTabs()).toEqual([t("tabs.champions"), t("tabs.browse")]);
    await click(t("tabs.pool"));
    expect(selectedTabs()).toEqual([t("tabs.champions"), t("tabs.pool")]);
    await click(t("tabs.last"));
    expect(selectedTabs()).toEqual([t("tabs.last")]);
    await click(t("tabs.me"));
    expect(selectedTabs()).toEqual([t("tabs.me"), t("tabs.month")]);
    await click(t("tabs.champions"));
    expect(selectedTabs()).toEqual([t("tabs.champions"), t("tabs.pool")]);
  });

  it("opens Next game when you've chosen roles, and falls back to the home tab when they go", async () => {
    await startApp(state());
    const pick = { champion: champ(103, "Ahri"), score: 0, expectedWin: 0.5, factors: [], terms: [], reasons: [], offMeta: false };
    await coach.push(state({ queuePreview: { roles: [{ role: "middle", picks: [pick], whyNot: null, confidence: null }] } as unknown as ViewState["queuePreview"] }));
    expect(selectedTabs()[0]).toBe(t("queue.tab"));
    await coach.push(state());
    expect(hasButton(t("queue.tab"))).toBe(false);
    expect(selectedTabs()[0]).toBe(t("tabs.me"));
  });

  it("a game that just ended takes you to Last game when it arrives", async () => {
    await startApp(state());
    const now = Date.now();
    await coach.push(state({ lastGame: { champion: champ(103, "Ahri"), role: "middle", win: true, durationSec: 1800, shown: [], lockedAt: now, endedAt: now, lines: [], terms: [] } as unknown as ViewState["lastGame"] }));
    expect(selectedTabs()).toEqual([t("tabs.last")]);
  });
});

describe("the tour", () => {
  const first = () => state({ ui: { tourDone: false, highlightsSeen: [] } });
  const stepText = () => document.querySelector(".tour-step")?.textContent;
  const at = (n: number) => t("tour.stepOf", { n, total: LOBBY_TOUR.length });
  const callout = () => document.querySelector(".tour")!;

  it("walks forward and back with the buttons, and Done ends it for good", async () => {
    await startApp(first());
    expect(stepText()).toBe(at(1));
    expect(hasButton(t("tour.back"))).toBe(false);
    await click(t("tour.next"));
    expect(stepText()).toBe(at(2));
    await click(t("tour.back"));
    expect(stepText()).toBe(at(1));
    for (let i = 1; i < LOBBY_TOUR.length; i++) await click(t("tour.next"));
    expect(stepText()).toBe(at(LOBBY_TOUR.length));
    expect(coach.api.tourDone).not.toHaveBeenCalled();
    await click(t("tour.done"));
    expect(document.querySelector(".tour")).toBeNull();
    expect(coach.api.tourDone).toHaveBeenCalledOnce();
  });

  it("Skip ends it from any step", async () => {
    await startApp(first());
    await click(t("tour.next"));
    await click(t("tour.skip"));
    expect(document.querySelector(".tour")).toBeNull();
    expect(coach.api.tourDone).toHaveBeenCalledOnce();
  });

  it("works from the keys: arrows move, Escape ends, Tab stays in the callout", async () => {
    await startApp(first());
    await key(callout(), "ArrowRight");
    expect(stepText()).toBe(at(2));
    await key(callout(), "ArrowLeft");
    await key(callout(), "ArrowLeft"); // stays on the first
    expect(stepText()).toBe(at(1));

    const items = [...callout().querySelectorAll<HTMLElement>("button")];
    items[0]!.focus();
    await key(callout(), "Tab");
    expect(document.activeElement).toBe(items[1]);
    await key(callout(), "Tab");
    expect(document.activeElement).toBe(items[0]);
    await key(callout(), "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(items[1]);

    await key(callout(), "Escape");
    expect(document.querySelector(".tour")).toBeNull();
    expect(coach.api.tourDone).toHaveBeenCalledOnce();
  });

  it("the panel behind takes no clicks until it ends", async () => {
    await startApp(first());
    expect(document.querySelector(".window")!.hasAttribute("inert")).toBe(true);
    await click(t("tour.skip"));
    expect(document.querySelector(".window")!.hasAttribute("inert")).toBe(false);
  });

  it("a draft hides it, and it picks up at the same step afterwards", async () => {
    await startApp(first());
    await click(t("tour.next"));
    await coach.push({ ...first(), draft: draft() });
    expect(document.querySelector(".tour")).toBeNull();
    await coach.push(first());
    expect(stepText()).toBe(at(2));
    expect(coach.api.tourDone).not.toHaveBeenCalled();
  });

  it("passes a step whose target isn't on screen", async () => {
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      const size = this.getAttribute("data-tour") === "tab-row" ? 0 : 100;
      return { x: 0, y: 0, top: 0, left: 0, right: size, bottom: size, width: size, height: size, toJSON: () => ({}) };
    });
    await startApp(first());
    await click(t("tour.next"));
    await settle();
    await click(t("tour.next"));
    await settle();
    // One step shorter, ending on the last: "tabs" was passed.
    expect(stepText()).toBe(t("tour.stepOf", { n: LOBBY_TOUR.length - 1, total: LOBBY_TOUR.length - 1 }));
    expect(hasButton(t("tour.done"))).toBe(true);
  });

  it("reopens from the footer at its start, and stays closed when it wasn't asked for", async () => {
    await startApp(state());
    expect(document.querySelector(".tour")).toBeNull();
    await click(t("tour.reopen"));
    expect(stepText()).toBe(at(1));
    await click(t("tour.next"));
    await click(t("tour.skip"));
    expect(document.querySelector(".tour")).toBeNull();
    await click(t("tour.reopen"));
    expect(stepText()).toBe(at(1));
  });
});

describe("signing out and deleting your data", () => {
  const openMenu = () => click(t("account.menu"));

  it("the menu opens and closes, and nothing happens without a confirm", async () => {
    await startApp(state());
    expect(hasButton(t("account.signOut"))).toBe(false);
    await openMenu();
    expect(hasButton(t("account.signOut"))).toBe(true);
    await click(t("account.close"));
    expect(hasButton(t("account.signOut"))).toBe(false);
    expect(hasButton(t("account.menu"))).toBe(true);
  });

  it("sign out asks first; No goes back and calls nothing", async () => {
    await startApp(state());
    await openMenu();
    await click(t("account.signOut"));
    expect(document.body.textContent).toContain(t("account.signOut.ask"));
    expect(coach.api.signOut).not.toHaveBeenCalled();
    await click(t("account.signOut.no"));
    expect(document.body.textContent).not.toContain(t("account.signOut.ask"));
    expect(coach.api.signOut).not.toHaveBeenCalled();
  });

  it("confirming signs out once, and only says what's happening meanwhile", async () => {
    let done = () => {};
    coach.api.signOut.mockImplementation(() => new Promise<void>((r) => (done = r)));
    await startApp(state());
    await openMenu();
    await click(t("account.signOut"));
    await click(t("account.signOut"));
    expect(coach.api.signOut).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain(t("account.signOut.busy"));
    expect(hasButton(t("account.signOut"))).toBe(false);
    expect(coach.api.deleteData).not.toHaveBeenCalled();
    done();
    await settle();
    expect(document.body.textContent).not.toContain(t("account.signOut.busy"));
  });

  it("delete asks first in its own words, calls deleteData once and never signOut", async () => {
    await startApp(state());
    await openMenu();
    await click(t("account.deleteLink"));
    expect(document.body.textContent).toContain(t("account.delete.ask"));
    expect(coach.api.deleteData).not.toHaveBeenCalled();
    await click(t("account.delete"));
    expect(coach.api.deleteData).toHaveBeenCalledOnce();
    expect(coach.api.signOut).not.toHaveBeenCalled();
  });

  it("delete's No keeps your data", async () => {
    await startApp(state());
    await openMenu();
    await click(t("account.deleteLink"));
    await click(t("account.delete.no"));
    expect(coach.api.deleteData).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Me#EUW");
  });

  it("a failed delete shows why, once it has finished", async () => {
    await startApp(state({ account: { ...registered, message: "Your data wasn't deleted. Try again." } }));
    expect(document.body.textContent).toContain("Your data wasn't deleted");
  });
});

describe("Explore: search, sort, open, back", () => {
  const row = (id: number, name: string, role: string, winRate: number, pickRate: number, games = 500) => ({ id, name, iconUrl: null, role, games, winRate, pickRate, banRate: 0.1, yours: null });
  const list: ExploreList = {
    rank: "Gold",
    patch: "16.19",
    matches: 5000,
    roles: ["top", "middle"],
    hasBans: true,
    rows: [row(145, "Kai'Sa", "middle", 0.49, 0.2), row(103, "Ahri", "middle", 0.52, 0.1), row(36, "Dr. Mundo", "top", 0.51, 0.05)],
  };
  const page1 = page();
  const champion: ExploreChampionView = { champion: champ(103, "Ahri"), role: "middle", rank: "Gold", games: 500, winRate: 0.52, pickRate: 0.1, banRate: 0.1, yours: null, pages: [page1], loadout: loadout(), core: null, matchups: { best: [], worst: [] } };

  /** Browse with its state held the way the lobby holds it. */
  function Harness({ s, start = initialBrowse }: { s: ViewState; start?: BrowseState }) {
    const [browse, setBrowse] = useState(start);
    return createElement("div", { className: "window" }, createElement(Browse, { state: s, browse, onBrowse: setBrowse, touring: false }));
  }
  const rows = () => [...document.querySelectorAll<HTMLElement>(".trow")].map((r) => r.querySelector(".nm")!.childNodes[0]!.textContent);
  const search = () => document.querySelector<HTMLInputElement>('input[type="search"]')!;
  const open = async () => {
    coach.api.exploreList.mockResolvedValue(list);
    coach.api.exploreChampion.mockResolvedValue(champion);
    await render(createElement(Harness, { s: state() }));
    await settle();
  };

  it("shows the rows best first, and typing searches without asking the main process again", async () => {
    await open();
    expect(rows()).toEqual(["Ahri", "Dr. Mundo", "Kai'Sa"]);
    await type(search(), "kaisa");
    expect(rows()).toEqual(["Kai'Sa"]);
    await type(search(), "dr mun");
    expect(rows()).toEqual(["Dr. Mundo"]);
    expect(coach.api.exploreList).toHaveBeenCalledOnce();
  });

  it("no match says so and offers to clear the search", async () => {
    await open();
    await type(search(), "zzz");
    expect(rows()).toEqual([]);
    await click(t("explore.clear"));
    expect(search().value).toBe("");
    expect(rows()).toHaveLength(3);
  });

  it("sorts by a column's click, and can't sort by bans a snapshot doesn't have", async () => {
    await open();
    await click(t("explore.col.pickRate"));
    expect(rows()).toEqual(["Kai'Sa", "Ahri", "Dr. Mundo"]);
    expect(button(t("explore.col.pickRate")).getAttribute("aria-pressed")).toBe("true");
    await cleanup();
    coach = fakeCoach();
    fakeLayout();
    coach.api.exploreList.mockResolvedValue({ ...list, hasBans: false });
    await render(createElement(Harness, { s: state(), start: { ...initialBrowse, filter: { ...initialBrowse.filter, sort: "banRate" } } }));
    await settle();
    expect(button(t("explore.col.banRate")).disabled).toBe(true);
    expect(button(t("explore.col.winRate")).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens the row clicked, for that champion and role, on Runes", async () => {
    await open();
    await click(document.querySelector('.trow[data-row="103|middle"]')!);
    await settle();
    expect(coach.api.exploreChampion).toHaveBeenCalledExactlyOnceWith(103, "middle");
    expect(selectedTabs()).toEqual([t("runes.tab")]);
    expect(document.querySelector(".trow")).toBeNull();
    expect(document.body.textContent).toContain("Ahri");
  });

  it("Back returns to the same search and focuses the row you came from", async () => {
    await open();
    await type(search(), "ah");
    const opened = document.querySelector('.trow[data-row="103|middle"]')!;
    await click(opened);
    await settle();
    await click(`‹ ${t("explore.back")}`);
    await settle();
    expect(search().value).toBe("ah");
    expect(rows()).toEqual(["Ahri"]);
    expect((document.activeElement as HTMLElement).getAttribute("data-row")).toBe("103|middle");
  });

  it("moves between a champion's tabs", async () => {
    await open();
    await click(document.querySelector('.trow[data-row="103|middle"]')!);
    await settle();
    await click(t("build.tab"));
    expect(selectedTabs()).toEqual([t("build.tab")]);
    await click(t("matchups.tab"));
    expect(selectedTabs()).toEqual([t("matchups.tab")]);
    expect(document.body.textContent).toContain(t("explore.noMatchups"));
  });

  it("a champion that can't be read says it's gone, and Back still works", async () => {
    await open();
    coach.api.exploreChampion.mockRejectedValue(new Error("ipc failed"));
    await click(document.querySelector('.trow[data-row="103|middle"]')!);
    await settle();
    expect(document.body.textContent).toContain(t("explore.gone"));
    await click(`‹ ${t("explore.back")}`);
    expect(rows()).toHaveLength(3);
  });

  it("a list that can't be read shows an empty message, not a broken screen", async () => {
    coach.api.exploreList.mockRejectedValue(new Error("ipc failed"));
    await render(createElement(Harness, { s: state() }));
    await settle();
    expect(document.querySelector(".trow")).toBeNull();
    expect(document.querySelector('input[type="search"]')).toBeNull();
    expect(document.body.textContent).toBeTruthy();
  });

  it("asks again only when the live data or your games change", async () => {
    coach.api.exploreList.mockResolvedValue(list);
    const a = state();
    await render(createElement(Harness, { s: a }));
    await settle();
    await rerender(createElement(Harness, { s: { ...a, notices: [{ key: "x", text: "y" }] } }));
    await settle();
    expect(coach.api.exploreList).toHaveBeenCalledOnce();
    await rerender(createElement(Harness, { s: { ...a, status: { ...a.status, patch: "16.20" } } }));
    await settle();
    expect(coach.api.exploreList).toHaveBeenCalledTimes(2);
  });

  it("in the lobby, what you searched survives leaving the tab", async () => {
    coach.api.exploreList.mockResolvedValue(list);
    await startApp(state());
    await click(t("tabs.champions"));
    await settle();
    await type(search(), "ah");
    await click(t("tabs.me"));
    await click(t("tabs.champions"));
    await settle();
    expect(search().value).toBe("ah");
  });
});

describe("the import button", () => {
  const footer = (pick: MyPickView, key: string | null = null) => createElement(LoadoutFooter, { pick, runes: { key, choose: () => {} } });

  it("does nothing until it's clicked, then asks for what's on screen, once", async () => {
    let done = () => {};
    coach.api.importLoadout.mockImplementation(() => new Promise<void>((r) => (done = r)));
    await render(footer(myPick()));
    await settle();
    expect(coach.api.importLoadout).not.toHaveBeenCalled();
    await click(t("import.runes"));
    expect(coach.api.importLoadout).toHaveBeenCalledExactlyOnceWith("runes", "page-1");
    // While it runs: says so, and a second click can't send it twice.
    const busy = button(t("import.busy"));
    expect(busy.disabled).toBe(true);
    await click(busy);
    expect(coach.api.importLoadout).toHaveBeenCalledOnce();
    done();
    await settle();
    expect(button(t("import.runes")).disabled).toBe(false);
  });

  it("offers what the build holds: all, runes or items", async () => {
    const item = { id: 1, name: "x", iconUrl: null };
    await render(footer(myPick({ loadout: loadout({ commonPath: { items: [item], reason: null } }) })));
    await click(t("import.all"));
    expect(coach.api.importLoadout).toHaveBeenLastCalledWith("all", "page-1");
    await cleanup();
    coach = fakeCoach();
    fakeLayout();
    await render(footer(myPick({ loadout: loadout({ page: null, commonPath: { items: [item], reason: null } }) })));
    await click(t("import.items"));
    expect(coach.api.importLoadout).toHaveBeenLastCalledWith("items", undefined);
  });

  it("isn't there when import is off, or the build has nothing to write", async () => {
    await render(footer(myPick({ loadout: loadout({ canImport: false }) })));
    expect(hasButton(t("import.all"))).toBe(false);
    expect(hasButton(t("import.runes"))).toBe(false);
    await cleanup();
    fakeLayout();
    await render(footer(myPick({ loadout: null })));
    expect(document.querySelector('[data-tour="import"]')).toBeNull();
  });

  it("sends the rune option chosen on screen, kept from hovering to locking in", async () => {
    const two = myPick({ loadout: loadout({ pageAlt: { ...page({ key: "page-2", optionLabel: "Second", share: 0.2 }), kind: "second" } as unknown as LoadoutView["pageAlt"] }) });
    await startApp(state({ draft: draft({ timerPhase: "BAN_PICK" }), hoverPick: { ...two, hovering: true } }));
    await click(t("runes.tab"));
    const second = [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Second"))!;
    await click(second);
    await coach.push(state({ draft: draft(), myPick: two }));
    await click(t("import.runes"));
    expect(coach.api.importLoadout).toHaveBeenCalledExactlyOnceWith("runes", "page-2");
  });

  it("shows each outcome as it came, a failure marked as one", async () => {
    await render(footer(myPick({ importLines: [{ text: "Rune page created", failed: false }, { text: "Spells failed", failed: true }] })));
    const lines = [...document.querySelectorAll(".import-status span")];
    expect(lines.map((l) => l.textContent)).toEqual(["Rune page created", "Spells failed"]);
    expect(lines.map((l) => l.classList.contains("neg"))).toEqual([false, true]);
  });
});

describe("the connect screen", () => {
  const CODE = "ABCD-EFGH-JKMN";
  const offline = (over: Partial<AccountView> = {}): ViewState => state({ account: { state: "unregistered", riotId: null, serverUrl: null, defaultServerUrl: "https://coach.test", message: null, ...over }, status: { ...emptyViewState().status, lcu: "connected" } });
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>(".code input")];
  const paste = (el: HTMLElement, text: string) => {
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.assign(e, { clipboardData: { getData: () => text } });
    return settleAfter(() => el.dispatchEvent(e));
  };
  const settleAfter = async (fn: () => unknown) => {
    fn();
    await settle();
  };
  const submit = () => button(t("connect.submit"));

  it("only lets you connect with a whole code and a client open, and sends both once", async () => {
    await startApp(offline());
    expect(submit().disabled).toBe(true);
    await type(boxes()[0]!, "ABCD");
    expect(submit().disabled).toBe(true);
    await paste(boxes()[0]!, CODE);
    expect(boxes().map((b) => b.value)).toEqual(["ABCD", "EFGH", "JKMN"]);
    expect(submit().disabled).toBe(false);
    await settleAfter(() => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(coach.api.register).toHaveBeenCalledExactlyOnceWith("https://coach.test", CODE);
  });

  it("won't connect with the client closed, whatever is typed", async () => {
    await startApp(state({ account: { state: "unregistered", riotId: null, serverUrl: null, defaultServerUrl: "https://coach.test", message: null } }));
    await paste(boxes()[0]!, CODE);
    expect(submit().disabled).toBe(true);
    await settleAfter(() => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(coach.api.register).not.toHaveBeenCalled();
  });

  it("a build that comes with its server shows no address to change", async () => {
    await startApp(offline());
    expect(document.querySelector("#server-url")).toBeNull();
    expect(document.body.textContent).not.toContain(t("connect.change"));
  });

  it("another server's address opens with Change, and an empty one stops you", async () => {
    await startApp(offline({ serverUrl: "https://other-coach.test" }));
    expect(document.querySelector("#server-url")).toBeNull();
    await click(t("connect.change"));
    await paste(boxes()[0]!, CODE);
    await type(document.querySelector<HTMLInputElement>("#server-url")!, " ");
    expect(submit().disabled).toBe(true);
    await type(document.querySelector<HTMLInputElement>("#server-url")!, "https://other.test");
    expect(submit().disabled).toBe(false);
  });

  it("with no address known, the field is open from the start", async () => {
    await startApp(offline({ defaultServerUrl: null }));
    expect(document.querySelector("#server-url")).not.toBeNull();
  });

  it("while connecting: says so and can't send again; a slow server gets the wake-up note", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await startApp(offline({ state: "registering", inviteCode: CODE }));
      expect(button(t("connect.busy")).disabled).toBe(true);
      expect(document.body.textContent).not.toContain(t("profile.waking"));
      await vi.advanceTimersByTimeAsync(4_000);
      await coach.push(offline({ state: "registering", inviteCode: CODE }));
      expect(document.body.textContent).toContain(t("profile.waking"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("a join link fills the code in while the screen is open, and an error is shown", async () => {
    await startApp(offline());
    await coach.push(offline({ inviteCode: CODE }));
    expect(boxes().map((b) => b.value)).toEqual(["ABCD", "EFGH", "JKMN"]);
    await coach.push(offline({ state: "error", message: "This invite code is wrong." }));
    expect(document.body.textContent).toContain("This invite code is wrong.");
  });

  it("another account in the client says so in place of the intro", async () => {
    await startApp(offline({ state: "mismatch", message: "This app is set up for Me#EUW." }));
    expect(document.body.textContent).toContain(t("connect.mismatch"));
    expect(document.body.textContent).toContain("set up for Me#EUW");
  });

  describe("the three boxes", () => {
    function Code() {
      const [v, set] = useState("");
      return createElement("div", {}, createElement(InviteCodeInput, { value: v, onChange: set, label: (i: number, n: number) => `${i}/${n}` }), createElement("output", {}, v));
    }
    const value = () => document.querySelector("output")!.textContent;

    it("typing past four moves on, cleaned and upper case", async () => {
      await render(createElement(Code));
      await type(boxes()[0]!, "ab-c d");
      expect(value()).toBe("ABCD");
      expect(document.activeElement).toBe(boxes()[1]);
    });

    it("more than fits flows into the next boxes", async () => {
      await render(createElement(Code));
      await type(boxes()[0]!, "abcdefgh");
      expect(boxes().map((b) => b.value)).toEqual(["ABCD", "EFGH", ""]);
      expect(document.activeElement).toBe(boxes()[2]);
    });

    it("typing in a later box first keeps its place", async () => {
      await render(createElement(Code));
      await type(boxes()[1]!, "ef");
      expect(value()).toBe("-EF");
      expect(boxes().map((b) => b.value)).toEqual(["", "EF", ""]);
    });

    it("Backspace in an empty box goes back; in a full one it doesn't", async () => {
      await render(createElement(Code));
      await type(boxes()[0]!, "abcd");
      expect(document.activeElement).toBe(boxes()[1]);
      await key(boxes()[1]!, "Backspace");
      expect(document.activeElement).toBe(boxes()[0]);
      boxes()[0]!.focus();
      await key(boxes()[0]!, "Backspace");
      expect(document.activeElement).toBe(boxes()[0]);
    });

    it("a short paste is left to the box itself", async () => {
      await render(createElement(Code));
      const e = new Event("paste", { bubbles: true, cancelable: true });
      Object.assign(e, { clipboardData: { getData: () => "AB" } });
      boxes()[0]!.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
      expect(value()).toBe("");
    });
  });
});

describe("notices and the window's buttons", () => {
  it("a dismiss button dismisses its own notice", async () => {
    await startApp(state({ notices: [{ key: "queue", text: "Not supported" }] }));
    await click(document.querySelector('[aria-label="Dismiss"]')!);
    expect(coach.api.dismissNotice).toHaveBeenCalledExactlyOnceWith("queue");
  });

  it("Retry now asks once, says it's trying, and can be pressed again after", async () => {
    let done = () => {};
    coach.api.retry.mockImplementation(() => new Promise<void>((r) => (done = r)));
    await startApp(state({ status: { ...emptyViewState().status, profile: { state: "error", message: "The server is down." } } }));
    await click(t("profile.retry"));
    expect(coach.api.retry).toHaveBeenCalledOnce();
    expect(button(t("profile.retrying")).disabled).toBe(true);
    done();
    await settle();
    expect(button(t("profile.retry")).disabled).toBe(false);
  });

  it("no retry link when you aren't signed in: there's nothing to retry with", async () => {
    await startApp(state({ account: null, status: { ...emptyViewState().status, profile: { state: "error", message: "No key." } } }));
    expect(hasButton(t("profile.retry"))).toBe(false);
  });

  it("restarts for an update only when asked, and only in the lobby's footer", async () => {
    await startApp(state({ app: { version: "1.0.0", updateReady: "1.0.1" } }));
    expect(coach.api.restartToUpdate).not.toHaveBeenCalled();
    await click(t("update.restart"));
    expect(coach.api.restartToUpdate).toHaveBeenCalledOnce();
    await coach.push(state({ app: { version: "1.0.0", updateReady: "1.0.1" }, draft: draft() }));
    expect(hasButton(t("update.restart"))).toBe(false);
  });

  it("the title bar's buttons reach the window", async () => {
    await startApp(state({ docked: true }));
    const header = document.querySelector(".header")!;
    const buttons = [...header.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) await click(b);
    expect(coach.api.setDocked).toHaveBeenCalledExactlyOnceWith(false);
    expect(coach.api.minimize).toHaveBeenCalledOnce();
    expect(coach.api.close).toHaveBeenCalledOnce();
  });
});

describe("champ select", () => {
  const suggestion = (id: number, name: string) => ({ champion: champ(id, name), score: 0, expectedWin: 0.5, factors: [], terms: [], reasons: [{ id: "x", text: `Why ${name}` }], offMeta: false });
  const picking = (over: Partial<ViewState> = {}) => state({ draft: draft(), pickRole: "middle", picks: [suggestion(103, "Ahri"), suggestion(245, "Ekko")] as unknown as ViewState["picks"], ...over });

  it("clicking another pick makes it the one explained", async () => {
    await startApp(picking());
    expect(document.body.textContent).toContain("Why Ahri");
    expect(document.body.textContent).not.toContain("Why Ekko");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Ekko"))!);
    expect(document.body.textContent).toContain("Why Ekko");
    expect(document.body.textContent).not.toContain("Why Ahri");
  });

  it("a new best pick from the draft takes the place of what you'd selected", async () => {
    await startApp(picking());
    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Ekko"))!);
    await coach.push(picking({ picks: [suggestion(84, "Akali"), suggestion(245, "Ekko")] as unknown as ViewState["picks"] }));
    expect(document.body.textContent).toContain("Why Akali");
  });

  it("the Runes and Build tabs come with a hover, and go when it does", async () => {
    await startApp(picking({ hoverPick: { ...myPick(), hovering: true } }));
    expect(selectedTabs()).toEqual([t("pick.tab")]);
    await click(t("runes.tab"));
    expect(selectedTabs()).toEqual([t("runes.tab")]);
    await coach.push(picking());
    expect(hasButton(t("runes.tab"))).toBe(false);
    await coach.push(picking({ hoverPick: { ...myPick(), hovering: true } }));
    expect(selectedTabs()).toEqual([t("pick.tab")]);
  });
});

describe("a crash in the panel", () => {
  it("shows the crash screen instead of a blank window, and logs what happened", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("render failed");
    };
    await render(createElement(ErrorBoundary, null, createElement(Boom)));
    expect(document.body.textContent).toBeTruthy();
    expect(document.body.textContent).not.toContain("render failed");
    expect(coach.api.logError).toHaveBeenCalledOnce();
    expect(String(coach.api.logError.mock.calls[0])).toContain("render failed");
    error.mockRestore();
  });
});
