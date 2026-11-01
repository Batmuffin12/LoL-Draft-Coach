import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { StatusHeader } from "../src/renderer/components/StatusHeader";
import { setCopy } from "../src/renderer/format";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { Notices } from "../src/renderer/screens/common";
import { emptyViewState, type ViewState } from "../src/shared/view";

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

describe("StatusHeader", () => {
  it("has a labelled minimize button right before close", () => {
    const html = renderToStaticMarkup(createElement(StatusHeader, { lcu: "connected", docked: true, onDock: () => {}, onMinimize: () => {}, onClose: () => {} }));
    const minimize = html.indexOf('aria-label="Minimize"');
    expect(minimize).toBeGreaterThan(-1);
    expect(html.slice(minimize)).toMatch(/^[^>]*>–<\/button><button class="icon-btn"[^>]*title="Close"/);
  });
});
