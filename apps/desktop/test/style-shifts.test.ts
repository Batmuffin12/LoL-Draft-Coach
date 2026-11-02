import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/view-copy";
import { StyleShifts, sortShifts } from "../src/renderer/components/StyleShifts";
import { isEvenStyle } from "../src/renderer/screens/Style";
import { setCopy } from "../src/renderer/format";
import type { AxisView, MonthView } from "../src/shared/view";

beforeAll(() => setCopy(uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates)));

type Axis = MonthView["axes"][number];
const axis = (label: string, from: number | null, to: number, changed: Axis["changed"]): Axis => ({ label, from, to, changed });

describe("what moved this month", () => {
  const axes = [axis("Farm", 50, 53, "up"), axis("Vision", 56, 50, "down"), axis("Fights", 60, 61, "steady"), axis("Lane", 40, 44, "steady"), axis("Roam", null, 30, null)];

  it("real changes first, biggest first; the rest apart", () => {
    const { real, steady, unknown } = sortShifts(axes);
    expect(real.map((a) => a.label)).toEqual(["Vision", "Farm"]);
    expect(steady.map((a) => a.label)).toEqual(["Fights", "Lane"]);
    expect(unknown.map((a) => a.label)).toEqual(["Roam"]);
  });

  it("shows a real change as a row with its numbers and a true minus", () => {
    const html = renderToStaticMarkup(createElement(StyleShifts, { axes }));
    expect(html).toContain("Vision");
    expect(html).toContain("56 → ");
    expect(html).toContain("−6");
    expect(html).toContain("+3");
  });

  it("collapses the rest to a line, with their numbers on hover", () => {
    const html = renderToStaticMarkup(createElement(StyleShifts, { axes }));
    expect(html).toContain("Other 2: about the same");
    expect(html).toContain("Fights 60 → 61");
    expect(html).toContain("Roam — → 30");
  });

  it("says so when nothing really moved", () => {
    const html = renderToStaticMarkup(createElement(StyleShifts, { axes: [axis("Fights", 60, 61, "steady")] }));
    expect(html).toContain("About the same as before");
    expect(html).not.toContain("Other");
  });
});

describe("a style close to your rank", () => {
  const a = (level: AxisView["level"]) => ({ level }) as AxisView;

  it("is even only when no axis stands out", () => {
    expect(isEvenStyle([a("mid"), a("mid"), a("mid")])).toBe(true);
    expect(isEvenStyle([a("mid"), a("high"), a("mid")])).toBe(false);
    expect(isEvenStyle([a("low"), a("mid")])).toBe(false);
    expect(isEvenStyle([])).toBe(false);
  });
});
