import { describe, expect, it } from "vitest";
import type { RunePageView } from "../src/shared/view";
import { shownPage } from "../src/renderer/rune-choice";

const page = (key: string) => ({ key }) as RunePageView;
const first = page("first");
const second = page("second");

describe("the rune option on screen", () => {
  it("is the first page until another is chosen", () => {
    expect(shownPage({ page: first, pageAlt: second }, null)).toBe(first);
    expect(shownPage({ page: first, pageAlt: second }, "first")).toBe(first);
  });

  it("is the chosen page, wherever it sits now", () => {
    expect(shownPage({ page: first, pageAlt: second }, "second")).toBe(second);
    // The draft moved on and the options swapped places: the same page stays on screen.
    expect(shownPage({ page: second, pageAlt: first }, "second")).toBe(second);
  });

  it("falls back to the first page when the chosen one is gone", () => {
    expect(shownPage({ page: first, pageAlt: page("third") }, "second")).toBe(first);
    expect(shownPage({ page: first, pageAlt: null }, "second")).toBe(first);
    expect(shownPage({ page: first, pageAlt: null }, null)).toBe(first);
    expect(shownPage({ page: null, pageAlt: null }, null)).toBeNull();
  });
});
