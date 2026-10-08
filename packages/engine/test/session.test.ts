import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { UserMatch } from "@ldc/shared";
import { parseEngineConfig, sessionCheck } from "../src/index";

const config = parseEngineConfig(JSON.parse(readFileSync(new URL("../../../config/engine.v1.json", import.meta.url), "utf8")));
const cfg = { ...config.session, gapMinutes: 45, lossStreak: 2, longSession: 5, minGames: 3 };
const MIN = 60_000;
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

/** One of your games that ended at `endedAt`. */
const game = (endedAt: number, win: boolean): UserMatch =>
  ({ match: { matchId: `G${endedAt}`, queueId: 420, gameVersion: "16.19", endedAt, durationSec: 1800, participants: [{ win }] }, me: 0 }) as unknown as UserMatch;

/** A session of games 35 minutes apart, the last one ending at `end`. */
const session = (end: number, results: boolean[]) => results.map((w, i) => game(end - (results.length - 1 - i) * 35 * MIN, w));

describe("sessionCheck", () => {
  it("speaks up after losses in a row in the running session, with your record after such streaks", () => {
    const history = [
      ...session(NOW - 3 * DAY, [false, false, false, true]), // after 2 losses: L, W
      ...session(NOW - 2 * DAY, [false, false, false]), // after 2 losses: L
      ...session(NOW - 1 * DAY, [true, false, false, true]), // after 2 losses: W
    ];
    const check = sessionCheck([...history, ...session(NOW - 10 * MIN, [true, false, false])], NOW, cfg);
    expect(check).toMatchObject({ reason: "losses", games: 3, lossStreak: 2 });
    // Four games came right after two losses in a row: 2 won.
    expect(check!.record).toMatchObject({ afterStreak: 2, games: 4, winRate: 0.5 });
  });

  it("speaks up in a long session, and stays quiet otherwise or once the session is over", () => {
    expect(sessionCheck(session(NOW - 5 * MIN, [true, false, true, false, true]), NOW, cfg)).toMatchObject({ reason: "long", games: 5, lossStreak: 0, record: null });
    expect(sessionCheck(session(NOW - 5 * MIN, [true, false, true]), NOW, cfg)).toBeNull();
    expect(sessionCheck(session(NOW - 2 * 3_600_000, [false, false, false]), NOW, cfg)).toBeNull();
    expect(sessionCheck([], NOW, cfg)).toBeNull();
  });
});
