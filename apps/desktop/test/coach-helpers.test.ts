import { describe, expect, it } from "vitest";
import type { DraftState } from "@ldc/shared";
import { blindDraft, queuePreviewWanted, queueSupported } from "../src/main/draft-facts";
import { hasGame, NewGameWaiter } from "../src/main/game-wait";

describe("draft facts", () => {
  it("previews the next game only in a lobby phase, with roles chosen, for a coached queue or a custom game", () => {
    const lobby = { positions: ["middle" as const], queueId: 420, isCustom: false };
    expect(queuePreviewWanted(lobby, "Lobby", [420])).toBe(true);
    expect(queuePreviewWanted(lobby, "ChampSelect", [420])).toBe(false);
    expect(queuePreviewWanted({ ...lobby, positions: [] }, "Lobby", [420])).toBe(false);
    expect(queuePreviewWanted({ ...lobby, queueId: 450 }, "Matchmaking", [420])).toBe(false);
    expect(queuePreviewWanted({ ...lobby, queueId: null, isCustom: true }, "ReadyCheck", [420])).toBe(true);
  });

  it("coaches a custom game, an unknown queue and a configured one", () => {
    const draft: DraftState = { ...blindDraft("middle"), isCustomGame: false };
    expect(queueSupported(draft, 420, [420])).toBe(true);
    expect(queueSupported(draft, null, [420])).toBe(true);
    expect(queueSupported(draft, 450, [420])).toBe(false);
    expect(queueSupported({ ...draft, isCustomGame: true }, 450, [420])).toBe(true);
  });
});

describe("waiting for a new game", () => {
  const match = (id: string) => ({ match: { matchId: id }, me: 0 }) as never;

  it("finds a game by its client id at the end of the match id", () => {
    expect(hasGame([match("EUW1_123")], 123)).toBe(true);
    expect(hasGame([match("EUW1_1234")], 123)).toBe(false);
    expect(hasGame(undefined, 123)).toBe(false);
  });

  it("refreshes until the game is in, says it's waiting meanwhile, and a newer wait replaces an older one", async () => {
    const pending: boolean[] = [];
    let refreshes = 0;
    let have = false;
    const waiter = new NewGameWaiter({
      profiles: () => ({ refresh: async () => void refreshes++ }),
      retrySeconds: () => [0, 0, 0],
      hasGame: () => have,
      pending: (w) => pending.push(w),
    });
    const first = waiter.wait(1);
    const second = waiter.wait(2);
    await first;
    // The first wait stopped (replaced) without clearing "waiting": the second still runs.
    expect(pending).toEqual([true, true]);
    have = true;
    await second;
    expect(pending).toEqual([true, true, false]);
    expect(refreshes).toBeGreaterThanOrEqual(2);
  });

  it("does nothing without a profile source", async () => {
    const pending: boolean[] = [];
    await new NewGameWaiter({ profiles: () => null, retrySeconds: () => [1], hasGame: () => false, pending: (w) => pending.push(w) }).wait(1);
    expect(pending).toEqual([]);
  });
});
