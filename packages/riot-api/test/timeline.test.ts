import { describe, expect, it } from "vitest";
import { ITEM_BOUGHT, ITEM_SOLD } from "@ldc/shared";
import { MatchSchema, TimelineSchema, summarizeTimeline } from "../src/index";

const match = MatchSchema.parse({
  metadata: { matchId: "EUW1_1" },
  info: {
    gameCreation: 0,
    gameDuration: 1800,
    queueId: 420,
    // Match participants in a different order than the timeline's participantIds.
    participants: [
      { puuid: "SECRET-B", championId: 2, teamId: 200, win: false },
      { puuid: "SECRET-A", championId: 1, teamId: 100, win: true },
    ],
  },
});

const raw = {
  metadata: { matchId: "EUW1_1", participants: ["SECRET-A", "SECRET-B"] },
  info: {
    frameInterval: 60000,
    participants: [
      { participantId: 1, puuid: "SECRET-A" },
      { participantId: 2, puuid: "SECRET-B" },
    ],
    frames: [
      {
        timestamp: 0,
        participantFrames: { "1": { participantId: 1, totalGold: 500, level: 1 }, "2": { participantId: 2, totalGold: 500 } },
        events: [
          { type: "ITEM_PURCHASED", timestamp: 2000, participantId: 1, itemId: 1055 },
          { type: "ITEM_PURCHASED", timestamp: 2500, participantId: 1, itemId: 2003 },
          { type: "ITEM_UNDO", timestamp: 3000, participantId: 1, beforeId: 2003, afterId: 0, goldGain: 50 },
          { type: "SKILL_LEVEL_UP", timestamp: 4000, participantId: 2, skillSlot: 1, levelUpType: "NORMAL" },
        ],
      },
      {
        timestamp: 60000,
        participantFrames: { "1": { participantId: 1, totalGold: 1200.4 }, "2": { participantId: 2, totalGold: 900 } },
        events: [
          { type: "ITEM_PURCHASED", timestamp: 600000, participantId: 2, itemId: 3031 },
          { type: "ITEM_DESTROYED", timestamp: 600000, participantId: 2, itemId: 1038 },
          { type: "ITEM_UNDO", timestamp: 601000, participantId: 2, beforeId: 3031, afterId: 0 },
          { type: "ITEM_SOLD", timestamp: 700000, participantId: 1, itemId: 1055 },
          { type: "SKILL_LEVEL_UP", timestamp: 800000, participantId: 2, skillSlot: 3, levelUpType: "EVOLVE" },
          { type: "SKILL_LEVEL_UP", timestamp: 810000, participantId: 2, skillSlot: 2 },
          { type: "WARD_PLACED", timestamp: 820000, creatorId: 1 },
          { type: "CHAMPION_KILL", timestamp: 830000, killerId: 1, victimId: 2 },
        ],
      },
    ],
  },
};

describe("summarizeTimeline", () => {
  const t = summarizeTimeline(TimelineSchema.parse(raw), match);

  it("lines participants up with the match by PUUID, keeping gold per minute", () => {
    expect(t.gold).toEqual([
      [500, 900],
      [500, 1200],
    ]);
  });

  it("keeps item events and removes undone purchases with the components they used", () => {
    expect(t.items).toEqual([
      [1, 2, ITEM_BOUGHT, 1055],
      [1, 700, ITEM_SOLD, 1055],
    ]);
  });

  it("keeps normal skill level-ups in order", () => {
    expect(t.skills).toEqual([[1, 2], []]);
  });

  it("never keeps PUUIDs", () => {
    expect(JSON.stringify(t)).not.toContain("SECRET");
  });
});
