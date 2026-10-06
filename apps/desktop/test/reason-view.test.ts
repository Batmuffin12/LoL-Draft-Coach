import { describe, expect, it } from "vitest";
import { isCaveat, reasonView } from "../src/main/reason-view";

describe("reasonView", () => {
  it("marks caveats (.bad, .weak, .risky) as negative", () => {
    expect(["lane.bad", "counter.bad", "meta.weak", "blind.risky"].every(isCaveat)).toBe(true);
    expect(["lane.good", "meta.strong", "blind.safe", "comfort.role", "badge", "weakness.note"].some(isCaveat)).toBe(false);
  });

  it("renders the text and keeps the flag", () => {
    const render = (r: { id: string }) => `text of ${r.id}`;
    expect(reasonView({ id: "lane.bad", slots: {} }, render)).toEqual({ text: "text of lane.bad", negative: true });
    expect(reasonView({ id: "lane.good", slots: {} }, render)).toEqual({ text: "text of lane.good", negative: false });
  });
});
