import { describe, expect, it } from "vitest";
import { estimateMetaPrior } from "../src/index";

describe("estimateMetaPrior (empirical Bayes)", () => {
  it("is large when win rates differ only by noise, small when they really differ", () => {
    // 40 champions, 1,000 games each, win rates 46%..54%: observed variance minus the noise 1,000 games carry.
    const rates = Array.from({ length: 40 }, (_, i) => 0.46 + (0.08 * i) / 39);
    const variance = rates.reduce((s, r) => s + (r - 0.5) ** 2, 0) / rates.length;
    expect(estimateMetaPrior(rates.map((r) => ({ games: 1000, wins: 1000 * r })))).toBeCloseTo(0.25 / (variance - 0.25 / 1000), 6);
    // Wider true differences: a weaker prior.
    const wide = rates.map((r) => ({ games: 1000, wins: 1000 * (0.5 + 2 * (r - 0.5)) }));
    expect(estimateMetaPrior(wide)!).toBeLessThan(estimateMetaPrior(rates.map((r) => ({ games: 1000, wins: 1000 * r })))!);
    const flat = Array.from({ length: 40 }, () => ({ games: 1000, wins: 500 }));
    expect(estimateMetaPrior(flat)).toBe(Infinity);
  });

  it("needs data", () => {
    expect(estimateMetaPrior([])).toBeNull();
    expect(estimateMetaPrior([{ games: 10, wins: 5 }])).toBeNull();
  });
});
