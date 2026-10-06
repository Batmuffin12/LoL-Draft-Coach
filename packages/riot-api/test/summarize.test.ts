import { describe, expect, it } from "vitest";
import { MatchSchema, participantIndex, summarizeMatch } from "../src/index";

const participant = (i: number, extra: Record<string, unknown> = {}) => ({
  puuid: `SECRET-PUUID-${i}`,
  riotIdGameName: `Player${i}`,
  riotIdTagline: "EUW",
  summonerId: `SUMMONER-${i}`,
  championId: 100 + i,
  teamId: i < 5 ? 100 : 200,
  teamPosition: "MIDDLE",
  win: i < 5,
  ...extra,
});

const raw = {
  metadata: { matchId: "EUW1_1", participants: Array.from({ length: 10 }, (_, i) => `SECRET-PUUID-${i}`) },
  info: {
    gameCreation: 1_000_000,
    gameDuration: 1800,
    gameEndTimestamp: 2_900_000,
    gameVersion: "16.19.1.1",
    queueId: 420,
    participants: Array.from({ length: 10 }, (_, i) =>
      participant(
        i,
        i === 3
          ? {
              kills: 7,
              deaths: 2,
              assists: 9,
              totalMinionsKilled: 180,
              neutralMinionsKilled: 12,
              goldEarned: 12_345,
              totalHeal: 4321,
              visionScore: 22,
              item0: 3157,
              item6: 3364,
              summoner1Id: 4,
              summoner2Id: 14,
              perks: {
                statPerks: { defense: 5001, flex: 5008, offense: 5005 },
                styles: [
                  { style: 8100, selections: [{ perk: 8112 }, { perk: 8139 }, { perk: 8138 }, { perk: 8135 }] },
                  { style: 8200, selections: [{ perk: 8226 }, { perk: 8210 }] },
                ],
              },
              challenges: { killParticipation: 0.64, laneMinionsFirst10Minutes: 71, legendaryItemUsed: [3157], soloKills: 2 },
            }
          : {},
      ),
    ),
  },
};

describe("summarizeMatch", () => {
  const match = MatchSchema.parse(raw);
  const summary = summarizeMatch(match);

  it("keeps game facts and the richer per-player stats", () => {
    expect(summary).toMatchObject({ matchId: "EUW1_1", queueId: 420, durationSec: 1800, endedAt: 2_900_000, gameVersion: "16.19.1.1" });
    expect(summary.participants[3]).toMatchObject({
      championId: 103,
      position: "middle",
      kills: 7,
      deaths: 2,
      assists: 9,
      cs: 192,
      gold: 12_345,
      heal: 4321,
      visionScore: 22,
      items: [3157, 0, 0, 0, 0, 0, 3364],
      spells: [4, 14],
      perks: { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8138, 8135, 8226, 8210], statPerks: [5001, 5008, 5005] },
      challenges: { killParticipation: 0.64, laneMinionsFirst10Minutes: 71, soloKills: 2 },
    });
  });

  it("keeps each team's bans (champion ids only, skipped bans dropped), and marks games without team data", () => {
    const withTeams = MatchSchema.parse({
      ...raw,
      info: {
        ...raw.info,
        teams: [
          { teamId: 100, win: true, bans: [{ championId: 238, pickTurn: 1 }, { championId: -1, pickTurn: 2 }] },
          { teamId: 200, win: false, bans: [{ championId: 555, pickTurn: 6 }], objectives: {} },
        ],
      },
    });
    expect(summarizeMatch(withTeams).bans).toEqual([
      { teamId: 100, championId: 238 },
      { teamId: 200, championId: 555 },
    ]);
    expect(summarizeMatch(MatchSchema.parse(raw)).bans).toBeUndefined();
  });

  it("defaults missing stats instead of failing, and drops non-numeric challenges", () => {
    expect(summary.participants[0]).toMatchObject({ kills: 0, cs: 0, perks: null, challenges: {} });
    expect(summary.participants[3]?.challenges).not.toHaveProperty("legendaryItemUsed");
  });

  it("never keeps PUUIDs, names or summoner ids", () => {
    const text = JSON.stringify(summary);
    for (const secret of ["SECRET-PUUID", "Player", "SUMMONER-"]) expect(text).not.toContain(secret);
  });

  it("finds the user's participant by PUUID without storing it", () => {
    expect(participantIndex(match, "SECRET-PUUID-3")).toBe(3);
    expect(participantIndex(match, "nobody")).toBe(-1);
  });
});
