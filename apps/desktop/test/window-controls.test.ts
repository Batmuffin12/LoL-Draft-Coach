import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ChampIcon, showsArt } from "../src/renderer/components/ChampIcon";
import { CrashScreen, ErrorBoundary } from "../src/renderer/components/ErrorBoundary";
import { StatusHeader } from "../src/renderer/components/StatusHeader";
import { setCopy, t } from "../src/renderer/format";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { AccountFooter, ConfirmRow, Notices } from "../src/renderer/screens/common";
import { LoadoutFooter } from "../src/renderer/screens/LockedInScreen";
import { canRestartToUpdate, emptyViewState, type AccountView, type MyPickView, type ViewState } from "../src/shared/view";

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

describe("Notices", () => {
  it("gives keyed notices a dismiss button; live status notices keep clearing by themselves", () => {
    const state = emptyViewState();
    state.notices = [{ key: "queue", text: "This queue isn't supported yet" }];
    state.status = { ...state.status, profile: { state: "error", message: "The coach server is down" } };
    const html = renderToStaticMarkup(createElement(Notices, { state }));
    expect(html).toContain("This queue isn&#x27;t supported yet");
    expect(html).toContain("The coach server is down");
    expect(html.match(/aria-label="Dismiss"/g)).toHaveLength(1);
  });
});

describe("Notices wording for the live meta", () => {
  const render = (meta: ViewState["meta"]) => renderToStaticMarkup(createElement(Notices, { state: { ...emptyViewState(), meta } }));

  it("says there's no data for this rank yet, as a note, without the server's words or 'band'", () => {
    const html = render({ state: "error", noSnapshot: true, message: "No meta snapshot for band 2 yet." });
    expect(html).toContain("No live data for your rank yet");
    expect(html).not.toMatch(/snapshot|band/);
    expect(html).toContain("notice info");
  });

  it("says what's wrong and what the coach does meanwhile", () => {
    const html = render({ state: "error", message: "Can't reach the coach server: check your internet connection." });
    expect(html).toContain("check your internet connection. Suggestions use your own games for now.");
    expect(html).not.toContain("notice info");
  });
});

describe("AccountFooter", () => {
  const account = { state: "registered", riotId: "Me#EUW", serverUrl: "https://x", message: null, inviteCode: null, clientRiotId: "Me#EUW" } as AccountView;

  it("starts with the links only: nothing is asked, and nothing happens without a confirmation", () => {
    const html = renderToStaticMarkup(createElement(AccountFooter, { state: { ...emptyViewState(), account, app: { version: "1.0.0", updateReady: null } } }));
    expect(html).toContain("Sign out");
    expect(html).toContain("Delete my data");
    expect(html).not.toContain("invite code");
  });

  it("has wording that says signing out or deleting costs the invite", () => {
    expect(t("account.signOut.ask")).toContain("You'll need a new invite code");
    expect(t("account.delete.ask")).toContain("You'll need a new invite code");
  });
});

describe("Restart to update", () => {
  const ready = { ...emptyViewState(), app: { version: "1.0.0", updateReady: "1.0.1" } };
  const inPhase = (gameflowPhase: string) => ({ ...ready, status: { ...ready.status, gameflowPhase } });
  const draft = {} as NonNullable<ViewState["draft"]>;

  it("is offered once an update is downloaded, outside champ select and games", () => {
    expect(canRestartToUpdate(ready)).toBe(true);
    for (const phase of ["None", "Lobby", "Matchmaking", "ReadyCheck", "EndOfGame"]) expect(canRestartToUpdate(inPhase(phase)), phase).toBe(true);
  });

  it("isn't offered without an update, in champ select or in a game", () => {
    expect(canRestartToUpdate(emptyViewState())).toBe(false);
    expect(canRestartToUpdate({ ...ready, draft })).toBe(false);
    for (const phase of ["ChampSelect", "GameStart", "InProgress", "Reconnect"]) expect(canRestartToUpdate(inPhase(phase)), phase).toBe(false);
  });

  it("shows the link in the footer only when it can be used, with one wording for the version", () => {
    const html = (state: ViewState) => renderToStaticMarkup(createElement(AccountFooter, { state }));
    expect(html(ready)).toContain("Restart to update");
    expect(html(ready)).toContain("v1.0.0 → 1.0.1 on restart");
    expect(html(inPhase("InProgress"))).not.toContain("Restart to update");
    expect(html(inPhase("InProgress"))).toContain("v1.0.0 → 1.0.1 on restart");
    expect(html(emptyViewState())).not.toContain("Restart to update");
  });
});

describe("ConfirmRow", () => {
  const props = { ask: "Sure?", yes: "Delete", busyText: "Deleting…", no: "Keep", onYes: () => {}, onNo: () => {} };

  it("asks, with both answers", () => {
    const html = renderToStaticMarkup(createElement(ConfirmRow, { ...props, busy: false, danger: true }));
    expect(html).toContain("Sure?");
    expect(html).toContain('class="foot-link danger"');
    expect(html).toContain(">Keep<");
  });

  it("while it runs, shows only what's happening: nothing can be clicked twice", () => {
    const html = renderToStaticMarkup(createElement(ConfirmRow, { ...props, busy: true }));
    expect(html).toContain("Deleting…");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<button");
  });
});

describe("LoadoutFooter", () => {
  const champion = { id: 103, name: "Ahri", iconUrl: null };
  const loadout = { canImport: true, page: {}, spells: null, items: [], commonPath: null, starting: null, games: 100, source: "Gold", thinNote: null };
  const pick = (over: object) => ({ champion, hovering: false, role: "middle", expectedWin: null, reasons: [], loadout, importLines: [], ...over }) as unknown as MyPickView;
  const html = (over: object) => renderToStaticMarkup(createElement(LoadoutFooter, { pick: pick(over), runes: { key: null, choose: () => {} } }));

  it("announces the outcome in a live region, in a failure tone when it failed", () => {
    const out = html({ importLines: [{ text: "Rune page updated in your client", failed: false }, { text: "Couldn't set the spells", failed: true }] });
    expect(out).toContain('role="status"');
    expect(out).toMatch(/class="caption text">Rune page updated/);
    expect(out).toMatch(/class="caption neg">Couldn&#x27;t set the spells/);
    // The result takes the place of the build's source line, so the footer stays about the same height.
    expect(out).not.toContain("From 100 games");
    expect(html({})).toContain("From 100 games");
  });

  it("explains why the button is gone after champ select", () => {
    const out = html({ importLines: [{ text: "Import works during champ select", failed: false }], loadout: { ...loadout, canImport: false } });
    expect(out).toContain("Import works during champ select");
    expect(out).not.toContain("Import runes");
  });
});

describe("ErrorBoundary", () => {
  it("catches a render error and shows Reload and Close, from the config's wording", () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new ErrorBoundary({ children: "panel" });
    expect(boundary.render()).toBe("panel");
    boundary.state = { failed: true };
    const html = renderToStaticMarkup(createElement("div", null, boundary.render()));
    expect(html).toContain("Something went wrong");
    expect(html).toContain(">Reload<");
    expect(html).toContain(">Close<");
    expect(html).toContain('role="alert"');
  });

  it("still has its words before any config arrived", () => {
    setCopy({});
    const html = renderToStaticMarkup(createElement(CrashScreen));
    setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates));
    expect(html).toContain(">Reload<");
    expect(html).not.toContain("crash.");
  });

  it("sends what happened to crash reports", () => {
    const reportError = vi.fn();
    vi.stubGlobal("window", { coach: { reportError } });
    new ErrorBoundary({ children: null }).componentDidCatch(new Error("boom"), { componentStack: "\n at App" });
    vi.unstubAllGlobals();
    expect(reportError).toHaveBeenCalledWith("boom\n at App");
  });
});

describe("ChampIcon", () => {
  const champ = { name: "Ahri", iconUrl: "https://x/ahri.png" };

  it("shows the image, and the initials without one", () => {
    expect(renderToStaticMarkup(createElement(ChampIcon, { champ }))).toContain("<img");
    const none = renderToStaticMarkup(createElement(ChampIcon, { champ: { name: "Ahri", iconUrl: null } }));
    expect(none).not.toContain("<img");
    expect(none).toContain(">A");
  });

  it("falls back to the initials only for the image that failed: a new one gets its chance", () => {
    expect(showsArt("https://x/a.png", null)).toBe(true);
    expect(showsArt("https://x/a.png", "https://x/a.png")).toBe(false);
    expect(showsArt("https://x/b.png", "https://x/a.png")).toBe(true);
    expect(showsArt(null, null)).toBe(false);
  });
});

describe("StatusHeader", () => {
  it("has a labelled minimize button right before close", () => {
    const html = renderToStaticMarkup(createElement(StatusHeader, { lcu: "connected", docked: true, onDock: () => {}, onMinimize: () => {}, onClose: () => {} }));
    const minimize = html.indexOf('aria-label="Minimize"');
    expect(minimize).toBeGreaterThan(-1);
    expect(html.slice(minimize)).toMatch(/^[^>]*>–<\/button><button class="icon-btn"[^>]*title="Close"/);
  });
});
