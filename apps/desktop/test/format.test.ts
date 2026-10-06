import { describe, expect, it } from "vitest";
import type { Term } from "@ldc/shared";
import { count, initials, pct, pickReasons, positionLabel, signed, thinTerm, topTerms } from "../src/renderer/format";

const term = (name: Term["name"], deltaWin: number, games = 100): Term => ({ name, deltaWin, games, rating: 0 });

describe("panel formats", () => {
  it("formats chances, signed points and counts", () => {
    expect(pct(0.537)).toBe("54%");
    expect(signed(0.021)).toBe("+2.1");
    expect(signed(-0.004)).toBe("−0.4");
    expect(signed(0.00001)).toBe("0.0");
    expect(count(1240)).toBe("1,240");
    expect(positionLabel("middle")).toBe("Middle");
    expect(initials("Lee Sin")).toBe("LS");
    expect(initials("Kai'Sa")).toBe("Ka");
  });
});

describe("topTerms", () => {
  it("takes the biggest terms and always keeps the biggest negative one", () => {
    const terms = [term("lane", 0.021), term("personal", 0.014), term("team", 0.009), term("meta", -0.004), term("counter", 0.003)];
    expect(topTerms(terms, 3).map((t) => t.name)).toEqual(["lane", "personal", "meta"]);
  });

  it("keeps the order when the caveat is already in, and drops zero terms", () => {
    const terms = [term("lane", -0.03), term("personal", 0.02), term("synergy", 0)];
    expect(topTerms(terms, 3).map((t) => t.name)).toEqual(["lane", "personal"]);
  });
});

describe("thinTerm", () => {
  const min = { meta: 30, pair: 15 };
  it("is faint under the engine's minimum games for that kind of term", () => {
    expect(thinTerm(term("meta", 0.01, 20), min)).toBe(true);
    expect(thinTerm(term("meta", 0.01, 40), min)).toBe(false);
    expect(thinTerm(term("lane", 0.01, 10), min)).toBe(true);
    expect(thinTerm(term("team", 0.01, 0), min)).toBe(false);
    expect(thinTerm(term("lane", 0.01, 10), undefined)).toBe(false);
  });
});

describe("pickReasons", () => {
  it("keeps the caveat when cutting reasons", () => {
    const r = (text: string, negative = false) => ({ text, negative });
    expect(pickReasons([r("a"), r("b"), r("c"), r("bad", true)], 2)).toEqual([r("a"), r("bad", true)]);
    expect(pickReasons([r("a"), r("b"), r("c")], 2)).toEqual([r("a"), r("b")]);
  });
});
