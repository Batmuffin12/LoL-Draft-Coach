import { describe, expect, it } from "vitest";
import type { CoachStatus, Term } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { count, games, initials, needsClient, pct, pickColumns, pickReasons, positionLabel, profileProgress, rate, roleName, setCopy, setRoleLabels, signed, signedOrDash, skillPath, tone, versionText, winTone } from "../src/renderer/format";
import { RESULT_WAIT_MS, resultOverdue } from "../src/shared/view";

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

describe("waiting states", () => {
  const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
  const ready = { state: "ready" as const, games: 5, role: null };

  it("never says 0 of 0, and gives no frozen count for older games", () => {
    setCopy(copy);
    expect(profileProgress({ state: "loading", done: 0, total: 0 })).toEqual({ text: "Checking for new games…" });
    expect(profileProgress({ state: "loading", done: 3, total: 40 })).toEqual({ text: "Loading your match history: 3 of 40", done: 3, total: 40 });
    expect(profileProgress({ ...ready, backlog: 412 })).toEqual({ text: "Older games still loading on the server" });
    expect(profileProgress(ready)).toBeNull();
    expect(profileProgress({ state: "idle" })).toBeNull();
    expect(profileProgress({ state: "error", message: "x" })).toBeNull();
  });

  it("says when the server is waking up, over the other lines", () => {
    setCopy(copy);
    expect(profileProgress({ state: "loading", done: 0, total: 0, waking: true })).toEqual({ text: "Waking the coach server, up to a minute" });
    expect(profileProgress({ ...ready, backlog: 3, waking: true })).toEqual({ text: "Waking the coach server, up to a minute" });
  });

  it("asks for the League client only when it's closed and nothing is saved", () => {
    const status = (lcu: "connected" | "disconnected", profile: CoachStatus["profile"]): CoachStatus => ({ lcu, gameflowPhase: null, patch: null, band: null, profile });
    expect(needsClient(status("disconnected", { state: "idle" }))).toBe(true);
    expect(needsClient(status("disconnected", { ...ready, games: 0 }))).toBe(true);
    expect(needsClient(status("disconnected", ready))).toBe(false);
    expect(needsClient(status("disconnected", { state: "loading", done: 0, total: 0 }))).toBe(false);
    expect(needsClient(status("connected", { state: "idle" }))).toBe(false);
  });

  it("stops promising a result once the panel gave up or the game is hours old", () => {
    const now = 1_800_000_000_000;
    const game = { result: null, endedAt: null, lockedAt: now - 60_000 };
    expect(resultOverdue(game, { pending: true, gaveUp: false }, now)).toBe(false);
    expect(resultOverdue(game, { pending: false, gaveUp: false }, now)).toBe(false);
    expect(resultOverdue(game, { pending: false, gaveUp: true }, now)).toBe(true);
    expect(resultOverdue({ ...game, lockedAt: now - RESULT_WAIT_MS - 1 }, { pending: false, gaveUp: false }, now)).toBe(true);
    // Still asking: not yet, even for an old game. And a result always wins.
    expect(resultOverdue({ ...game, lockedAt: now - RESULT_WAIT_MS - 1 }, { pending: true, gaveUp: false }, now)).toBe(false);
    expect(resultOverdue({ ...game, result: "win" }, { pending: false, gaveUp: true }, now)).toBe(false);
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

describe("pickReasons with little room", () => {
  it("keeps the first plus and the warning, not just the first line", () => {
    const plus = { text: "a", negative: false };
    const minus = { text: "bad", negative: true };
    expect(pickReasons([plus, { text: "b", negative: false }, minus], 1)).toEqual([plus, minus]);
    expect(pickReasons([plus, { text: "b", negative: false }], 1)).toEqual([plus]);
  });
});

describe("pickReasons with your record on screen", () => {
  const own = { text: "277 recent mid games", negative: false, ownRecord: true };
  const meta = { text: "Strong in your rank", negative: false };

  it("drops the reason that only repeats it", () => {
    expect(pickReasons([own, meta], 3, true)).toEqual([meta]);
  });

  it("keeps it when your record isn't shown", () => {
    expect(pickReasons([own, meta], 3, false)).toEqual([own, meta]);
    expect(pickReasons([own, meta], 3)).toEqual([own, meta]);
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

describe("versionText", () => {
  it("shows the version, and the downloaded update until a restart", () => {
    expect(versionText({ version: "1.0.0", updateReady: null })).toBe("v1.0.0");
    expect(versionText({ version: "1.0.0", updateReady: "1.0.1" })).toBe("v1.0.0 → 1.0.1 on restart");
    expect(versionText({ version: "", updateReady: null })).toBe("");
  });
});
