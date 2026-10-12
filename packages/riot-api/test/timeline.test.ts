import { describe, expect, it } from "vitest";
import { ITEM_BOUGHT, ITEM_SOLD } from "@ldc/shared";
import { deathsBefore, MatchSchema, TimelineSchema, summarizeTimeline, withEarlyDeaths } from "../src/index";

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

  it("keeps champion kills lined up with the match: second, killer, victim, assists bitmask", () => {
    expect(t.kills).toEqual([[830, 1, 0, 0]]);
    const withAssist = structuredClone(raw);
    withAssist.info.frames[1]!.events.push({ type: "CHAMPION_KILL", timestamp: 900000, killerId: 0, victimId: 1, assistingParticipantIds: [2] } as never);
    expect(summarizeTimeline(TimelineSchema.parse(withAssist), match).kills).toEqual([
      [830, 1, 0, 0],
      [900, -1, 1, 0b01],
    ]);
  });

  it("keeps levels per minute only when every participant has them", () => {
    expect(t.levels).toBeUndefined();
    const leveled = structuredClone(raw);
    leveled.info.frames.forEach((f, k) => Object.values(f.participantFrames).forEach((pf) => Object.assign(pf, { level: k + 1 })));
    expect(summarizeTimeline(TimelineSchema.parse(leveled), match).levels).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });

  it("keeps CS per minute (only when every participant has it), vision wards and epic monsters", () => {
    expect(t.cs).toBeUndefined();
    expect(t.wards).toEqual([]); // the fixture's ward has no type: not a vision ward
    const more = structuredClone(raw);
    more.info.frames.forEach((f, k) => Object.values(f.participantFrames).forEach((pf) => Object.assign(pf, { minionsKilled: 10 * k, jungleMinionsKilled: k })));
    more.info.frames[1]!.events.push(
      { type: "WARD_PLACED", timestamp: 300000, creatorId: 2, wardType: "CONTROL_WARD" } as never,
      { type: "WARD_PLACED", timestamp: 310000, creatorId: 1, wardType: "TEEMO_MUSHROOM" } as never,
      { type: "ELITE_MONSTER_KILL", timestamp: 341000, killerId: 2, killerTeamId: 200, assistingParticipantIds: [1] } as never,
      { type: "ELITE_MONSTER_KILL", timestamp: 555000, killerId: 1, killerTeamId: 100 } as never,
    );
    const s = summarizeTimeline(TimelineSchema.parse(more), match);
    expect(s.cs).toEqual([
      [0, 11],
      [0, 11],
    ]);
    expect(s.wards).toEqual([[300, 0]]); // participant 2 is the match's first
    expect(s.monsters).toEqual([
      [341, 0, 0b10, 200],
      [555, 1, 0, 100],
    ]);
  });

  it("never keeps PUUIDs", () => {
    expect(JSON.stringify(t)).not.toContain("SECRET");
  });
});

describe("deathsBefore", () => {
  const timeline = TimelineSchema.parse(raw);

  it("counts each participant's deaths before the minute, lined up with the match", () => {
    // Participant 2 (SECRET-B, match index 0) died at 13:50.
    expect(deathsBefore(timeline, match, 14 * 60)).toEqual([1, 0]);
    expect(deathsBefore(timeline, match, 13 * 60)).toEqual([0, 0]);
  });

  it("stamps the counts on the summary's participants", () => {
    const s = withEarlyDeaths({ participants: [{ championId: 2 }, { championId: 1 }] }, [1, 0]);
    expect(s.participants).toEqual([
      { championId: 2, earlyDeaths: 1 },
      { championId: 1, earlyDeaths: 0 },
    ]);
  });
});
