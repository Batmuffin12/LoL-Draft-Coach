import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_BOUGHT, type MetaSnapshot } from "@ldc/shared";
import { firstItemTiming, MetaIndex, parseEngineConfig } from "../src/index";

const config = parseEngineConfig(JSON.parse(readFileSync(new URL("../../../config/engine.v1.json", import.meta.url), "utf8")));
const COMPLETED = new Set([3031, 3032]);

const snapshot = {
  format: 1, band: 2, createdAt: 0, patch: null, matches: 1000, newestMatchAt: 0, halfLifeDays: 10,
  roleGames: { middle: 2000 }, champions: [], matchups: [], duos: [], attributes: [], references: {},
  builds: [
    {
      championId: 4, role: "middle", n: 100, games: 100, wins: 50, pages: [], core: [], starting: [], skills: [], lifts: [],
      items: [
        { itemId: 3031, slot: 1, n: 80, share: 0.8, winAdded: 0, minute: 11 },
        { itemId: 3032, slot: 1, n: 20, share: 0.2, winAdded: 0, minute: 13 },
        { itemId: 3032, slot: 2, n: 70, share: 0.7, winAdded: 0, minute: 17 },
      ],
    },
  ],
} as unknown as MetaSnapshot;

/** Your game on champion 4 mid, completing 3031 at `sec` (after a component, and a later second item). */
const game = (sec: number | null, championId = 4, position = "middle") => ({
  me: 0,
  match: {
    participants: [{ championId, position, win: true }],
    timeline: { gold: [[]], skills: [[]], items: [[0, 30, ITEM_BOUGHT, 1055], ...(sec === null ? [] : [[0, sec, ITEM_BOUGHT, 3031], [0, sec + 400, ITEM_BOUGHT, 3032]])] },
  },
});

describe("firstItemTiming", () => {
  const index = new MetaIndex(snapshot, config.rating);

  it("averages your first completed item on the champion against the band's slot-1 minute", () => {
    const matches = [game(780), game(840), game(600, 7), game(500, 4, "top"), game(null)] as never;
    const t = firstItemTiming(matches, 4, "middle", index, COMPLETED, 2, 1.5)!;
    expect(t.games).toBe(2);
    expect(t.you).toBeCloseTo(13.5);
    expect(t.typical).toBeCloseTo(11.4); // 80 games at 11, 20 at 13
    expect(t.slow).toBe(true);
    expect(firstItemTiming(matches, 4, "middle", index, COMPLETED, 2, 3)!.slow).toBe(false);
  });

  it("needs enough of your games, and says nothing typical without the band's build", () => {
    expect(firstItemTiming([game(780)] as never, 4, "middle", index, COMPLETED, 2)).toBeNull();
    expect(firstItemTiming([game(780), game(800)] as never, 4, "middle", null, COMPLETED, 2)).toMatchObject({ typical: null, slow: false });
  });
});
