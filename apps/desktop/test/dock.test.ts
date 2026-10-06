import { describe, expect, it } from "vitest";
import { computeDockBounds, dockWidth, dockZoom, PANEL_WIDTH, sameRect } from "../src/main/dock";

const screen = { x: 0, y: 0, width: 1920, height: 1040 };

describe("computeDockBounds", () => {
  it("docks to the right of the client when there is room", () => {
    expect(computeDockBounds({ x: 100, y: 100, width: 1280, height: 720 }, PANEL_WIDTH, screen)).toEqual({
      x: 1380,
      y: 100,
      width: 440,
      height: 720,
    });
  });

  it("docks to the left when the right side is full", () => {
    expect(computeDockBounds({ x: 600, y: 50, width: 1280, height: 720 }, PANEL_WIDTH, screen)).toEqual({
      x: 160,
      y: 50,
      width: 440,
      height: 720,
    });
  });

  it("overlaps the right edge when neither side fits", () => {
    const b = computeDockBounds({ x: 0, y: 0, width: 1920, height: 1040 }, PANEL_WIDTH, screen);
    expect(b).toEqual({ x: 1480, y: 0, width: 440, height: 1040 });
  });

  it("works on a secondary display with an offset work area", () => {
    const second = { x: 1920, y: 0, width: 2560, height: 1400 };
    const b = computeDockBounds({ x: 2000, y: 200, width: 1600, height: 900 }, dockWidth(dockZoom(900)), second);
    expect(b).toEqual({ x: 3600, y: 200, width: 550, height: 900 });
  });

  it("keeps the panel inside the work area vertically", () => {
    const b = computeDockBounds({ x: 100, y: 600, width: 1024, height: 576 }, PANEL_WIDTH, screen);
    expect(b.y + b.height).toBeLessThanOrEqual(screen.height);
  });
});

describe("sameRect", () => {
  it("compares rectangles", () => {
    expect(sameRect({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 4 })).toBe(true);
    expect(sameRect({ x: 1, y: 2, width: 3, height: 4 }, null)).toBe(false);
  });
});

describe("dock zoom", () => {
  it("scales the panel with the client height, never below 1", () => {
    expect(dockZoom(720)).toBe(1);
    expect(dockZoom(900)).toBe(1.25);
    expect(dockZoom(1080)).toBe(1.5);
    expect(dockZoom(576)).toBe(1);
  });

  it("gives the docked width for a zoom (440 at 720p)", () => {
    expect([720, 900, 1080, 576].map((h) => dockWidth(dockZoom(h)))).toEqual([440, 550, 660, 440]);
  });
});
