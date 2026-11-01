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
const steps = () => LOBBY_TOUR;

describe("the lobby tour", () => {
  it("runs over the real lobby, opening with its intro and without Back", () => {
    const html = lobby({}, startTour());
    expect(html).toContain('class="seg"');
    expect(html).toContain(t("tour.intro"));
    expect(html).toContain(">Skip<");
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Back<");
  });

  it("says where it is, in words", () => {
    expect(lobby({}, startTour())).toContain(`>1 of ${steps().length}<`);
  });

  it("says at once that you choose", () => {
    expect(lobby({}, startTour())).toContain(t("tour.intro.end"));
  });

  it("isn't there when not running", () => {
    expect(lobby()).not.toContain(t("tour.intro"));
    expect(lobby()).not.toContain(">Skip<");
  });

  it("has what its steps spotlight on the screen", () => {
    const html = lobby({ account: registered });
    for (const step of steps()) if (step.target) expect(html).toContain(`data-tour="${step.target}"`);
  });
});

describe("the footer", () => {
  it("offers the tour again, registered or in development mode", () => {
    expect(lobby({ account: registered })).toContain("How it works");
    expect(lobby({ account: null })).toContain("How it works");
  });

  it("keeps signing out and deleting behind Account, closed at first", () => {
    const html = lobby({ account: registered });
    expect(html).toMatch(/aria-expanded="false"[^>]*>Account</);
    expect(html).not.toContain(t("account.signOut"));
    expect(html).not.toContain(t("account.deleteLink"));
  });

  it("has Riot's notice in full", () => {
    expect(lobby({ account: registered })).toContain("isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.");
  });
});
