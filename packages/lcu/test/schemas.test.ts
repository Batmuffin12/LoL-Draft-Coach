import { describe, expect, it } from "vitest";
import {
  ChampSelectSessionSchema,
  LcuSchemaError,
  RankedStatsSchema,
  parseLcu,
  sanitizeChampSelect,
  unavailableChampions,
} from "../src/index";
import { loadFixture } from "../src/testing";

const fixture = loadFixture("synthetic-draft-pick");
const sessions = fixture.frames.filter((f) => f.eventType === "Update" && f.uri === "/lol-champ-select/v1/session");

describe("champ select schema", () => {
  it("accepts every session frame in the fixture", () => {
    for (const f of sessions) expect(() => parseLcu(ChampSelectSessionSchema, f.uri, f.data)).not.toThrow();
  });

  it("tolerates unknown new fields", () => {
    const data = { ...(sessions[0]!.data as object), someNewRiotField: { x: 1 } };
    expect(ChampSelectSessionSchema.safeParse(data).success).toBe(true);
  });

  it("fails with a clear error when a field we rely on changes", () => {
    const data = { ...(sessions[0]!.data as object), localPlayerCellId: "two" };
    expect(() => parseLcu(ChampSelectSessionSchema, "/lol-champ-select/v1/session", data)).toThrow(LcuSchemaError);
    expect(() => parseLcu(ChampSelectSessionSchema, "/lol-champ-select/v1/session", data)).toThrow(/localPlayerCellId/);
  });

  it("keeps tiers as plain strings (new tiers need no code change)", () => {
    const r = RankedStatsSchema.parse({ queues: [{ queueType: "RANKED_SOLO_5x5", tier: "SOME_NEW_TIER", division: "II" }] });
    expect(r.queues[0]?.tier).toBe("SOME_NEW_TIER");
  });
});

describe("sanitizeChampSelect", () => {
  const withIdentities = (() => {
    const raw = structuredClone(sessions.at(-1)!.data) as Record<string, any>;
    for (const p of [...raw.myTeam, ...raw.theirTeam]) {
      Object.assign(p, {
        puuid: "secret-puuid",
        summonerId: 123456,
        gameName: "SomePlayer",
        tagLine: "EUW",
        obfuscatedPuuid: "x",
        nameVisibilityType: "VISIBLE",
      });
    }
    return parseLcu(ChampSelectSessionSchema, "/lol-champ-select/v1/session", raw);
  })();

  it("never lets player identities through", () => {
    const text = JSON.stringify(sanitizeChampSelect(withIdentities));
    for (const leak of ["secret-puuid", "123456", "SomePlayer", "puuid", "summonerId", "gameName", "tagLine", "nameVisibility"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("maps champions, positions, bans and the local player", () => {
    const d = sanitizeChampSelect(withIdentities);
    expect(d.localCellId).toBe(2);
    expect(d.myTeam.find((s) => s.isLocalPlayer)?.position).toBe("middle");
    expect(d.myTeam.map((s) => s.championId)).toEqual([86, 32, 103, 51, 111]);
    expect(d.theirTeam.map((s) => s.championId)).toEqual([54, 59, 21, 25, 122]);
    expect(d.myBans).toHaveLength(5);
    expect(d.timerPhase).toBe("FINALIZATION");
  });

  it("lists banned and taken champions as unavailable, but not the local hover", () => {
    const planning = parseLcu(ChampSelectSessionSchema, "s", fixture.snapshots["/lol-champ-select/v1/session"]);
    expect(unavailableChampions(sanitizeChampSelect(planning)).size).toBe(0);
    const banned = parseLcu(ChampSelectSessionSchema, "s", sessions[1]!.data);
    const u = unavailableChampions(sanitizeChampSelect(banned));
    expect(u.has(238)).toBe(true);
    expect(u.has(266)).toBe(true);
    expect(u.has(103)).toBe(false);
  });
});
