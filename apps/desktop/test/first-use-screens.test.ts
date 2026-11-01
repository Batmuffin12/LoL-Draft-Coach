import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { setCopy, t } from "../src/renderer/format";
import { LobbyScreen } from "../src/renderer/screens/LobbyScreen";
import { OnboardingScreen } from "../src/renderer/screens/OnboardingScreen";
import { emptyViewState, type AccountView, type ViewState } from "../src/shared/view";

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

const noop = () => {};
const lobby = (over: Partial<ViewState> = {}) => renderToStaticMarkup(createElement(LobbyScreen, { state: { ...emptyViewState(), ...over }, onHowItWorks: noop }));
const registered = { state: "registered", riotId: "Sim#SIM", serverUrl: null, defaultServerUrl: null, message: null } satisfies AccountView;

describe("the tour", () => {
  let html = "";
  beforeAll(() => {
    html = renderToStaticMarkup(createElement(OnboardingScreen, { state: emptyViewState(), onClose: noop }));
  });

  it("opens on the first card, with Skip and Next but nothing to go back to", () => {
    expect(html).toContain(t("tour.card1.title"));
    expect(html).toContain(">Skip<");
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Back<");
  });

  it("says where you are, for screen readers too", () => {
    expect(html).toContain('aria-label="Step 1 of 4"');
  });

  it("shows wording, never raw keys", () => {
    expect(html).not.toMatch(/tour\.card/);
  });
});

describe("the footer", () => {
  it("offers the tour again, registered or in development mode", () => {
    expect(lobby({ account: registered })).toContain("How it works");
    expect(lobby({ account: null })).toContain("How it works");
  });
});

describe("the lobby's hint", () => {
  it("shows for the tab on a first visit", () => {
    expect(lobby()).toContain(t("hint.me"));
  });

  it("doesn't show again once seen", () => {
    expect(lobby({ ui: { tourDone: true, hintsSeen: ["me"] } })).not.toContain(t("hint.me"));
  });
});
