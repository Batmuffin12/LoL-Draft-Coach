import { describe, expect, it } from "vitest";
import { createJevAdapter, decideWithFallback, DisabledJev, JevUnavailableError, MockJev, withNoneOption, type JevQuestion } from "../src/index";

const question = (options: string[]): JevQuestion & { kind: "one_of" } => ({
  kind: "one_of",
  id: "final-pick",
  prompt: "Which candidate is best for this draft?",
  options: withNoneOption(options),
  state: { candidates: options },
});
const thresholds = { act: 0.7, clear: 0.85 };

describe("feature flag", () => {
  it("is off by default and when no key is set", async () => {
    expect(createJevAdapter({ enabled: false, apiKey: "k" }).available).toBe(false);
    expect(createJevAdapter({ enabled: true, apiKey: null }).available).toBe(false);
    await expect(new DisabledJev().decide(question(["A"]))).rejects.toBeInstanceOf(JevUnavailableError);
  });

  it("still returns the disabled adapter when enabled, until the real client exists (TODO)", () => {
    expect(createJevAdapter({ enabled: true, apiKey: "k" }).available).toBe(false);
  });
});

describe("withNoneOption", () => {
  it("adds 'none of these' once", () => {
    expect(withNoneOption(["A", "B"])).toEqual(["A", "B", "none of these"]);
    expect(withNoneOption(["A", "None of these"])).toEqual(["A", "None of these"]);
    expect(withNoneOption([], "no change")).toEqual(["no change"]);
  });
});

describe("decideWithFallback", () => {
  it("uses the engine when Jev is disabled", async () => {
    const d = await decideWithFallback(new DisabledJev(), question(["A", "B"]), "A", thresholds);
    expect(d).toEqual({ answer: "A", source: "engine", confidence: null, label: null });
  });

  it("acts on confident answers and labels them", async () => {
    const clear = new MockJev(() => ({ answer: "B", probability: 0.9, confidence: 0.91 }));
    expect(await decideWithFallback(clear, question(["A", "B"]), "A", thresholds)).toMatchObject({ answer: "B", source: "jev", label: "clear" });
    const close = new MockJev(() => ({ answer: "B", probability: 0.6, confidence: 0.75 }));
    expect(await decideWithFallback(close, question(["A", "B"]), "A", thresholds)).toMatchObject({ answer: "B", label: "close" });
    expect(clear.asked[0]).toMatchObject({ options: ["A", "B", "none of these"] });
  });

  it("falls back below the threshold, on 'none of these', and on errors", async () => {
    const low = new MockJev(() => ({ answer: "B", probability: 0.4, confidence: 0.5 }));
    expect((await decideWithFallback(low, question(["A", "B"]), "A", thresholds)).source).toBe("engine");
    const none = new MockJev(() => ({ answer: "none of these", probability: 0.9, confidence: 0.95 }));
    expect((await decideWithFallback(none, question(["A"]), "A", thresholds, (a) => a === "none of these")).source).toBe("engine");
    const broken = new MockJev(() => new Error("503"));
    expect((await decideWithFallback(broken, question(["A"]), "A", thresholds)).source).toBe("engine");
  });
});
