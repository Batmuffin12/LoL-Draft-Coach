import { describe, expect, it } from "vitest";
import { history } from "../src/index";

describe("synthetic history", () => {
  const now = Date.UTC(2026, 9, 1);

  it("is the same for the same seed and anchor time", () => {
    expect(history({ now, games: 40 })).toEqual(history({ now, games: 40 }));
    expect(history({ now, games: 40, seed: 2 })).not.toEqual(history({ now, games: 40 }));
  });

  it("has the asked number of games, newest first, before the anchor, with ten seats each", () => {
    const h = history({ now, games: 150 });
    expect(h.matches).toHaveLength(150);
    const ended = h.matches.map((m) => m.match.endedAt);
    expect([...ended].sort((a, b) => b - a)).toEqual(ended);
    expect(ended[0]).toBeLessThan(now);
    expect(now - ended.at(-1)!).toBeGreaterThan(30 * 86_400_000);
    for (const { match, me } of h.matches) {
      expect(match.participants).toHaveLength(10);
      expect(new Set(match.participants.map((p) => p.championId)).size).toBe(10);
      expect(match.participants[me]).toBeDefined();
    }
    expect(h.masteries.length).toBeGreaterThan(3);
  });

  it("holds no identifiers", () => {
    expect(JSON.stringify(history({ now, games: 20 }))).not.toMatch(/puuid|gameName|tagLine|summonerName|riotId/i);
  });
});
