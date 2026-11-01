import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { LOBBY_TOUR, startTour, type TourRun } from "../src/renderer/first-use";
import { setCopy, t } from "../src/renderer/format";
import { LobbyScreen } from "../src/renderer/screens/LobbyScreen";
import { emptyViewState, type AccountView, type ViewState } from "../src/shared/view";

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

const noop = () => {};
const registered = { state: "registered", riotId: "Sim#SIM", serverUrl: null, defaultServerUrl: null, message: null } satisfies AccountView;
const lobby = (over: Partial<ViewState> = {}, run: TourRun | null = null) =>
  renderToStaticMarkup(createElement(LobbyScreen, { state: { ...emptyViewState(), ...over }, onHowItWorks: noop, tour: run && { run, onRun: noop, onClose: noop } }));
const selected = (html: string) => /aria-selected="true"[^>]*>([^<]+)</.exec(html)?.[1];
const at = (id: string) => ({ ...startTour(), index: steps().findIndex((s) => s.id === id) });
// Without Browse and My games until those sub-tabs exist.
const steps = () => LOBBY_TOUR.filter((s) => !["browse", "my-games"].includes(s.id));

describe("the lobby tour", () => {
  it("runs over the real lobby, opening with its intro and without Back", () => {
    const html = lobby({}, startTour());
    expect(html).toContain('class="seg"');
    expect(html).toContain(t("tour.intro"));
    expect(html).toContain(">Skip<");
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Back<");
  });

  it("says where it is, for screen readers too", () => {
    expect(lobby({}, startTour())).toContain(`Step 1 of ${steps().length}`);
  });

  it("opens the tab each step is about", () => {
    expect(selected(lobby({}, at("last")))).toBe("Last game");
    expect(selected(lobby({}, at("me")))).toBe("Me");
    expect(selected(lobby({}, at("champions")))).toBe("Champions");
  });

  it("isn't there when not running", () => {
    expect(lobby()).not.toContain(t("tour.intro"));
    expect(lobby()).not.toContain(">Skip<");
  });

  it("has what its steps spotlight on the screen", () => {
    const html = lobby({ account: registered });
    for (const target of ["tab-last", "tab-me", "tab-champions", "status-dot", "window-buttons", "how-it-works"]) expect(html).toContain(`data-tour="${target}"`);
  });
});

describe("the footer", () => {
  it("offers the tour again, registered or in development mode", () => {
    expect(lobby({ account: registered })).toContain("How it works");
    expect(lobby({ account: null })).toContain("How it works");
  });
});
