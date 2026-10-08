import { describe, expect, it } from "vitest";
import type { Term } from "@ldc/shared";
import { count, games, initials, pct, pickColumns, pickReasons, positionLabel, rate, roleName, setRoleLabels, signed, signedOrDash, skillPath, tone, winTone } from "../src/renderer/format";

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

describe("table formats", () => {
  it("shows a dash for no number, k above 10,000 games, and tones from zero and from 50%", () => {
    expect(rate(0.532, 1)).toBe("53.2%");
    expect(rate(null)).toBe("—");
    expect(signedOrDash(null)).toBe("—");
    expect(games(1240)).toBe("1,240");
    expect(games(12_400)).toBe("12k");
    expect([tone(0.021), tone(-0.008), tone(0.001), tone(null)]).toEqual(["pos", "neg", "flat", "flat"]);
    expect([winTone(0.54), winTone(0.495), winTone(0.503)]).toEqual(["pos", "neg", "flat"]);
  });
});

describe("pickColumns", () => {
  it("keeps the lane alone (as its reason says), adds team + synergy + counter, and keeps personal and meta apart", () => {
    const c = pickColumns([term("lane", 0.021), term("counter", 0.004), term("personal", 0.014), term("team", 0.009), term("synergy", -0.002), term("meta", -0.004)]);
    expect(c.lane).toBeCloseTo(0.021);
    expect(c.you).toBeCloseTo(0.014);
    expect(c.team).toBeCloseTo(0.011);
    expect(c.meta).toBeCloseTo(-0.004);
    expect(pickColumns([term("meta", 0.01)])).toMatchObject({ lane: null, you: null, team: null });
  });
});

describe("skillPath", () => {
  it("takes the first three levels, then the max order, with the ultimate at 6, 11 and 16", () => {
    const path = skillPath(["Q", "E", "W"], ["Q", "W", "E"], "R");
    expect(path).toHaveLength(18);
    expect(path.slice(0, 9).join("")).toBe("QEWQQRQQW");
    expect([path[5], path[10], path[15]]).toEqual(["R", "R", "R"]);
    expect(path.filter((k) => k === "Q")).toHaveLength(5);
    expect(path.filter((k) => k === "W")).toHaveLength(5);
    expect(path.filter((k) => k === "E")).toHaveLength(5);
  });
});

describe("pickReasons", () => {
  it("keeps the caveat when cutting reasons", () => {
    const r = (text: string, negative = false) => ({ text, negative });
    expect(pickReasons([r("a"), r("b"), r("c"), r("bad", true)], 2)).toEqual([r("a"), r("bad", true)]);
    expect(pickReasons([r("a"), r("b"), r("c")], 2)).toEqual([r("a"), r("b")]);
  });
});

describe("position names", () => {
  it("uses the client's names from the config, Riot's id otherwise", () => {
    setRoleLabels({ utility: "support", middle: "mid" });
    expect(positionLabel("utility")).toBe("Support");
    expect(roleName("middle")).toBe("mid");
    expect(positionLabel("jungle")).toBe("Jungle");
    setRoleLabels({});
  });
});
