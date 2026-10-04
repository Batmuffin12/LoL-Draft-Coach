import { describe, expect, it } from "vitest";
import { normalizePosition } from "../src/index";

describe("normalizePosition", () => {
  it("lower-cases and trims client / Match-V5 positions", () => {
    expect(normalizePosition("UTILITY")).toBe("utility");
    expect(normalizePosition(" Middle ")).toBe("middle");
  });

  it("maps missing values to the empty string", () => {
    expect(normalizePosition(null)).toBe("");
    expect(normalizePosition(undefined)).toBe("");
    expect(normalizePosition("")).toBe("");
  });
});
