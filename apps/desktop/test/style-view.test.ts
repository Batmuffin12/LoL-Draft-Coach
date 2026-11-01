import { describe, expect, it } from "vitest";
import type { MetricResult, StyleProfile } from "@ldc/engine";
import { findConfigDir, loadConfig } from "../src/main/config";
import { percentileFromQuantiles } from "@ldc/engine";
import { howView, metricSentence, numberAgrees, numberViews, sideView, styleSummary } from "../src/main/style-view";

const { explain } = loadConfig(findConfigDir(__dirname));
const metric = (o: Partial<MetricResult>): MetricResult => ({ metric: "csPerMinute", lowerIsBetter: false, you: 6.6, reference: 6.9, percentile: 0.45, games: 120, ...o });

describe("style view", () => {
  it("shows each headline number with typical in your rank, coloured only when it's clearly off", () => {
    const v = numberViews(
      [metric({}), metric({ metric: "challenges.killParticipation", you: 0.48, reference: 0.46, percentile: 0.52 }), metric({ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.2, reference: 0.25, percentile: 0.6 })],
      explain,
      0.04,
    );
    expect(v).toEqual([
      { label: "CS/min", you: "6.6", typical: "6.9", tone: "neg", title: "CS per minute: you 6.6, typical in your rank 6.9, from 120 games", relative: expect.closeTo(-0.1) },
      { label: "KP", you: "48%", typical: "46%", tone: null, title: "kill participation: you 48%, typical in your rank 46%, from 120 games", relative: expect.closeTo(0.04) },
      { label: "Deaths/min", you: "0.20", typical: "0.25", tone: "pos", title: "deaths per minute: you 0.20, typical in your rank 0.25, from 120 games", relative: expect.closeTo(0.2) },
    ]);
    expect(metricSentence(metric({}), explain)).toBe("CS per minute: you 6.6, typical in your rank 6.9");
  });

  describe("when the number and its percentile disagree", () => {
    const kda = metric({ metric: "kda", you: 4, reference: 3.3, percentile: 0.3 });

    it("KDA 4.0 vs 3.3 at the 30th percentile claims no direction: neutral, on the line, numbers as they are", () => {
      const [v] = numberViews([kda], explain, 0.04);
      expect(v).toMatchObject({ you: "4.0", typical: "3.3", tone: null, relative: 0 });
    });

    it("also the other way round, and for lower-is-better numbers", () => {
      const [low, deaths] = numberViews([metric({ metric: "kda", you: 2, reference: 3.3, percentile: 0.7 }), metric({ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.3, reference: 0.2, percentile: 0.7 })], explain, 0.04);
      expect(low).toMatchObject({ tone: null, relative: 0 });
      expect(deaths).toMatchObject({ tone: null, relative: 0 });
    });

    it("numbers that read the same claim no direction either", () => {
      const [v] = numberViews([metric({ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.151, reference: 0.149, percentile: 0.7 })], explain, 0.04);
      expect(v).toMatchObject({ you: "0.15", typical: "0.15", tone: null, relative: 0 });
    });

    it("when they agree, nothing changes", () => {
      expect(numberAgrees(metric({ you: 8, reference: 6, percentile: 0.8 }), explain)).toBe(true);
      expect(numberAgrees(metric({ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.1, reference: 0.2, percentile: 0.8 }), explain)).toBe(true);
      expect(numberAgrees(metric({ you: 8, reference: 6, percentile: 0.5 }), explain)).toBe(true);
    });

    it("really happens on a skewed number: a few huge games lift the average, most games stay below the median", () => {
      const quantiles = [0.5, 1.5, 2.3, 2.8, 3.3, 3.9, 4.6, 5.6, 7, 10, 25];
      const games = [1, 1.2, 1.5, 1.5, 2, 2, 2.2, 2.5, 18, 22];
      const average = games.reduce((a, b) => a + b, 0) / games.length;
      const percentile = games.reduce((a, b) => a + percentileFromQuantiles(b, quantiles), 0) / games.length;
      expect(average).toBeGreaterThan(quantiles[5]!);
      expect(percentile).toBeLessThan(0.45);
    });
  });

  it("places you from −1 to 1 around typical, better to the right even for lower-is-better numbers", () => {
    const [low, high] = numberViews([metric({ you: 5, percentile: 0 }), metric({ metric: "deathsPerMinute", lowerIsBetter: true, you: 0.2, reference: 0.3, percentile: 1 })], explain, 0.04);
    expect(low!.relative).toBe(-1);
    expect(high!.relative).toBe(1);
  });

  it("sums up a role's style from its high and low axes, without numbers", () => {
    expect(styleSummary([{ axis: "farming", level: "high" }, { axis: "earlyPressure", level: "high" }, { axis: "vision", level: "low" }, { axis: "riskControl", level: "low" }, { axis: "roaming", level: "mid" }], explain.templates)).toEqual([
      { label: "Strong", items: [{ text: "Out-farm your rank" }, { text: "Win lane early" }] },
      { label: "Weak spots", items: [{ text: "Vision" }, { text: "Early deaths" }] },
    ]);
    expect(styleSummary([{ axis: "vision", level: "low" }], explain.templates)).toEqual([{ label: "Weak spots", items: [{ text: "Vision" }] }]);
    expect(styleSummary([{ axis: "vision", level: "mid" }], explain.templates)).toEqual([{ label: "Your style", items: [{ text: "Your style is close to your rank's average" }] }]);
    expect(styleSummary([], explain.templates)).toEqual([]);
    for (const axis of Object.keys(explain.axes)) for (const level of ["high", "low"]) expect(explain.templates[`style.summary.${level}.${axis}`], `${level}.${axis}`).toBeTruthy();
  });

  it("words pool focus, classes and the damage split", () => {
    const p: StyleProfile = {
      role: "bottom",
      games: 100,
      headline: [],
      focus: { champions: 15, top: [{ n: 1, share: 0.47 }, { n: 3, share: 0.58 }] },
      classes: [{ tag: "Marksman", share: 0.6 }],
      damage: { physical: 0.7, magic: 0.22, true: 0.08 },
    };
    expect(howView(p, explain)).toEqual({
      games: 100,
      focus: "top 1 47% · top 3 58%",
      champions: "15 champions",
      classes: [{ label: "Marksman", share: 0.6 }],
      damage: [
        { kind: "physical", label: "physical", share: 0.7 },
        { kind: "magic", label: "magic", share: 0.22 },
        { kind: "true", label: "true", share: 0.08 },
      ],
    });
    expect(howView({ ...p, focus: { champions: 1, top: [] }, damage: null }, explain)).toMatchObject({ champions: "1 champion", damage: null });
  });

  it("says the side split only when it's real", () => {
    const split = { blue: { games: 150, winRate: 0.58 }, red: { games: 140, winRate: 0.44 } };
    expect(sideView({ ...split, better: "blue" }, explain)).toBe("You win 58% on the blue side vs 44% on red, over 290 games: a real gap, not chance");
    expect(sideView({ ...split, better: null }, explain)).toBeNull();
    expect(sideView(null, explain)).toBeNull();
  });
});
