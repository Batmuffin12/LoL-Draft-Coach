import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { BanTable } from "../src/renderer/components/BanTable";
import { NewChampTable } from "../src/renderer/components/NewChampTable";
import { PhaseBar } from "../src/renderer/components/PhaseBar";
import { StatusHeader } from "../src/renderer/components/StatusHeader";
import { setCopy, tip } from "../src/renderer/format";
import { connectBlocker } from "../src/renderer/screens/ConnectScreen";
import type { BanView, NewChampView } from "../src/shared/view";

const ahri = { id: 103, name: "Ahri", iconUrl: null };
const noop = () => {};

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

describe("accessibility", () => {
  it("every header button has a name", () => {
    const html = renderToStaticMarkup(createElement(StatusHeader, { lcu: "connected", docked: true, onDock: noop, onMinimize: noop, onClose: noop }));
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toMatch(/aria-label="[^"]+"/);
  });

  it("the call is announced, the countdown isn't", () => {
    const html = renderToStaticMarkup(createElement(PhaseBar, { timerPhase: "BAN_PICK", localAction: "pick", secondsLeft: 1, totalSeconds: 30, waitingText: "x" }));
    expect(html).not.toMatch(/<section[^>]*aria-live/);
    expect(html).toMatch(/aria-live="polite"[^>]*>\s*Your pick/);
    expect(html).toMatch(/role="timer" aria-live="off" aria-label="1 second left"/);
  });

  it("ban and new-champion rows take keyboard focus and carry their reasons, with cell roles", () => {
    const ban = { champion: ahri, threat: -0.01, winRate: 0.5, pickRate: 0.1, banRate: 0.1, reasons: ["Strong in mid"] } as BanView;
    const bans = renderToStaticMarkup(createElement(BanTable, { bans: [ban] }));
    expect(bans).toMatch(/role="row" title="Strong in mid[^"]*" tabindex="0" data-tip=/i);
    expect(bans).toContain('role="cell"');
    expect(bans).toContain('role="columnheader"');
    const row = { champion: ahri, like: null, winRate: 0.5, games: 100, ease: 1, easeLabel: "Easy", owned: true, reasons: ["Adds magic"] } as NewChampView;
    const news = renderToStaticMarkup(createElement(NewChampTable, { rows: [row], brief: true }));
    expect(news).toMatch(/role="row" title="Adds magic" tabindex="0"/i);
    expect(news).toContain('role="cell"');
  });

  it("hover text reaches the keyboard; nothing to say adds no tab stop", () => {
    expect(tip("why")).toEqual({ title: "why", tabIndex: 0, "data-tip": "why" });
    expect(tip("")).toEqual({});
    expect(tip(null)).toEqual({});
  });

  it("disabled Connect gives its reason", () => {
    const code = "ABCD".repeat(3);
    expect(connectBlocker(code, "https://x", false)).toBe("connect.noClient");
    expect(connectBlocker("AB", "https://x", true)).toBe("connect.needCode");
    expect(connectBlocker(code, " ", true)).toBe("connect.needServer");
    expect(connectBlocker(code, "https://x", true)).toBeNull();
  });
});
