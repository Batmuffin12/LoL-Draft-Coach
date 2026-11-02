import { describe, expect, it } from "vitest";
import { history } from "@ldc/sim";
import type { UserMatch } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { sessionView } from "../src/main/last-game-view";
import { playstyleViews } from "../src/main/style-view";

const config = loadConfig(findConfigDir(__dirname));
const NOW = Date.UTC(2026, 9, 1);
const LEVELS = ["high", "mid", "low"];

describe("your style per role, from a real-shaped history", () => {
  const { matches } = history({ now: NOW, games: 200 });

  it("gives no view from too few games, rather than a guess", () => {
    const few = history({ now: NOW, games: 3 }).matches;
    expect(playstyleViews(few, NOW, config.engine, config.explain, () => undefined, () => undefined)).toEqual([]);
  });

  it("says no more than three roles, each axis named and levelled with wording from the config", () => {
    const views = playstyleViews(matches, NOW, config.engine, config.explain, () => undefined, () => ["Mage"]);
    expect(views.length).toBeGreaterThan(0);
    expect(views.length).toBeLessThanOrEqual(3);
    for (const v of views) {
      expect(v.games).toBeGreaterThan(0);
      expect(v.axes.length).toBeGreaterThan(0);
      for (const a of v.axes) {
        expect(a.label).toBe(config.explain.axes[a.axis] ?? a.axis);
        expect(LEVELS).toContain(a.level);
        expect(a.levelLabel).toBe(config.explain.templates[`playstyle.level.${a.level}`]);
        expect(a.score).toBeGreaterThanOrEqual(0);
        expect(a.score).toBeLessThanOrEqual(100);
      }
      expect(v.how?.games).toBeGreaterThan(0);
    }
  });
});

describe("the break suggestion", () => {
  const game = (i: number, win: boolean, endedAt: number): UserMatch => ({ me: 0, match: { matchId: `EUW1_${i}`, queueId: 420, gameVersion: "16.19", endedAt, durationSec: 1800, participants: [{ championId: 103, teamId: 100, position: "middle", win }] } }) as unknown as UserMatch;
  const MIN = 60_000;

  it("says nothing after a good run", () => {
    const wins = [0, 1, 2].map((i) => game(i, true, NOW - i * 40 * MIN));
    expect(sessionView(wins, NOW, config)).toBeNull();
  });

  it("after a losing streak: the streak in words, and it lasts until the session's gap is up", () => {
    const streak = config.engine.session.lossStreak;
    const lost = Array.from({ length: streak }, (_, i) => game(i, false, NOW - i * 40 * MIN));
    const view = sessionView(lost, NOW, config)!;
    expect(view.text).toContain(String(streak));
    expect(view.until).toBe(NOW + config.engine.session.gapMinutes * MIN);
    expect(view.record).toBeNull();
  });
});
