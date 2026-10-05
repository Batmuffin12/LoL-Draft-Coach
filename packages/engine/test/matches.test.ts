import { describe, expect, it } from "vitest";
import type { ParticipantSummary, UserMatch } from "@ldc/shared";
import { attributeSamples, playerGame } from "../src/index";

const p = (championId: number, position: string, win: boolean): ParticipantSummary => ({
  championId, teamId: 100, position, win, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, visionScore: 0,
  physicalDamage: 100, magicDamage: 50, trueDamage: 0, damageTaken: 1000, selfMitigated: 500, ccSeconds: 10,
  objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {},
});

const um: UserMatch = {
  match: { matchId: "EUW1_1", queueId: 420, gameVersion: "x", endedAt: 5000, durationSec: 1200, participants: [p(1, "top", true), p(2, "jungle", false)] },
  me: 1,
};

describe("stored match helpers", () => {
  it("extract the user's game", () => {
    expect(playerGame(um)).toEqual({ championId: 2, position: "jungle", win: false, endedAt: 5000 });
    expect(playerGame({ ...um, me: 9 })).toBeNull();
  });

  it("turn every participant into an attribute sample, flagging the user", () => {
    const s = attributeSamples(um);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.self)).toEqual([false, true]);
    expect(s[0]).toMatchObject({ championId: 1, position: "top", physicalDamage: 100, durationSec: 1200 });
  });
});
