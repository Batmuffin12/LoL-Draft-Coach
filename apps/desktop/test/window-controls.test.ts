import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { StatusHeader } from "../src/renderer/components/StatusHeader";
import { setCopy, t } from "../src/renderer/format";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { AccountFooter, ConfirmRow, Notices } from "../src/renderer/screens/common";
import { canRestartToUpdate, emptyViewState, type AccountView, type ViewState } from "../src/shared/view";

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

describe("StatusHeader", () => {
  it("has a labelled minimize button right before close", () => {
    const html = renderToStaticMarkup(createElement(StatusHeader, { lcu: "connected", docked: true, onDock: () => {}, onMinimize: () => {}, onClose: () => {} }));
    const minimize = html.indexOf('aria-label="Minimize"');
    expect(minimize).toBeGreaterThan(-1);
    expect(html.slice(minimize)).toMatch(/^[^>]*>–<\/button><button class="icon-btn"[^>]*title="Close"/);
  });
});
