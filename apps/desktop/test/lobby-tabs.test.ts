import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { setCopy } from "../src/renderer/format";
import { LobbyScreen } from "../src/renderer/screens/LobbyScreen";
import { emptyViewState, type ViewState } from "../src/shared/view";

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

const render = (over: Partial<ViewState> = {}) => renderToStaticMarkup(createElement(LobbyScreen, { state: { ...emptyViewState(), ...over } }));
const tabs = (html: string) => [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
const selected = (html: string) => /aria-selected="true"[^>]*>([^<]+)</.exec(html)?.[1];
const pills = (html: string) => [...html.matchAll(/class="pill(?: on)?"[^>]*>([^<]+)</g)].map((m) => m[1]);

describe("lobby tabs", () => {
  it("has three main tabs, and opens Me on its first sub-tab", () => {
    const html = render();
    expect(tabs(html)).toEqual(["Last game", "Me", "Champions"]);
    expect(selected(html)).toBe("Me");
    expect(pills(html)).toEqual(["Style", "This month"]);
    expect(html).toMatch(/class="pill on"[^>]*>Style</);
  });

  it("opens Last game after a recent game, without sub-tabs", () => {
    const html = render({ lastGame: { champion: { id: 1, name: "Ahri", iconUrl: null }, role: "middle", win: true, durationSec: 1800, shown: [], lockedAt: Date.now(), endedAt: Date.now(), lines: [], terms: [] } as unknown as ViewState["lastGame"] });
    expect(selected(html)).toBe("Last game");
    expect(pills(html)).toEqual([]);
  });

  it("adds Next game while roles are queued", () => {
    const pick = { champion: { id: 1, name: "Ahri", iconUrl: null }, score: 0, expectedWin: 0.5, factors: [], terms: [], reasons: [], offMeta: false };
    const html = render({ queuePreview: { roles: [{ role: "middle", picks: [pick], whyNot: null, confidence: null }] } as unknown as ViewState["queuePreview"] });
    expect(tabs(html)).toEqual(["Next game", "Last game", "Me", "Champions"]);
  });
});
