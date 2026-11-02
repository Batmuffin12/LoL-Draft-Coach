import { describe, expect, it } from "vitest";
import { formatMetric, metricLabel, metricShort, type ExplainConfig } from "../src/index";

const cfg = { metrics: { pct: { format: "percent", label: "Win share" }, int: { format: "integer" }, fine: { format: "decimal2", short: "F" } } } as unknown as ExplainConfig;

describe("metric wording", () => {
  it("formats a value the way its metric says, one decimal otherwise", () => {
    expect(formatMetric(0.456, "pct", cfg)).toBe("46%");
    expect(formatMetric(6.6, "int", cfg)).toBe("7");
    expect(formatMetric(0.234, "fine", cfg)).toBe("0.23");
    expect(formatMetric(6.66, "unknown", cfg)).toBe("6.7");
  });

  it("names a metric by its label, or by Riot's field split into words", () => {
    expect(metricLabel("pct", cfg)).toBe("Win share");
    expect(metricLabel("challenges.killParticipation", cfg)).toBe("kill participation");
    expect(metricLabel("csPerMinute", cfg)).toBe("cs per minute");
    expect(metricShort("fine", cfg)).toBe("F");
    expect(metricShort("pct", cfg)).toBe("Win share");
  });
});
