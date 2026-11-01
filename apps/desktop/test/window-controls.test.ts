import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { StatusHeader } from "../src/renderer/components/StatusHeader";
import { setCopy } from "../src/renderer/format";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

describe("StatusHeader", () => {
  it("has a labelled minimize button right before close", () => {
    const html = renderToStaticMarkup(createElement(StatusHeader, { lcu: "connected", docked: true, onDock: () => {}, onMinimize: () => {}, onClose: () => {} }));
    const minimize = html.indexOf('aria-label="Minimize"');
    expect(minimize).toBeGreaterThan(-1);
    expect(html.slice(minimize)).toMatch(/^[^>]*>–<\/button><button class="icon-btn"[^>]*title="Close"/);
  });
});
