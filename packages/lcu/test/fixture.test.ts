import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anonymize, anonymizeFixture, findIdentifiers, FixtureSchema } from "../src/index";
import { FIXTURES_DIR } from "../src/testing";

function listFixtures(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "raw" ? [] : listFixtures(p);
    return name.endsWith(".json") ? [p] : [];
  });
}

describe("anonymize", () => {
  it("removes identifier keys at any depth and keeps draft data", () => {
    const raw = {
      gameId: 7123456789,
      chatDetails: { multiUserChatId: "room", multiUserChatPassword: "pw" },
      localPlayerCellId: 2,
      myTeam: [{ cellId: 0, championId: 86, puuid: "p", summonerId: 1, gameName: "n", tagLine: "t", playerAlias: "a" }],
      actions: [[{ id: 4, actorCellId: 0, championId: 86 }]],
    };
    const clean = anonymize(raw);
    expect(clean).toEqual({
      localPlayerCellId: 2,
      myTeam: [{ cellId: 0, championId: 86 }],
      actions: [[{ id: 4, actorCellId: 0, championId: 86 }]],
    });
    expect(findIdentifiers(clean)).toEqual([]);
    expect(findIdentifiers(raw).length).toBeGreaterThan(0);
  });

  it("anonymises snapshots and frames of a fixture", () => {
    const f = anonymizeFixture({
      format: 1,
      description: "",
      recordedAt: "x",
      snapshots: { "/lol-summoner/v1/current-summoner": { puuid: "p", gameName: "me", summonerLevel: 30 } },
      frames: [{ t: 0, uri: "/u", eventType: "Update", data: { myTeam: [{ summonerId: 9, cellId: 1 }] } }],
    });
    expect(findIdentifiers(f)).toEqual([]);
  });
});

describe("committed fixtures", () => {
  const files = listFixtures(FIXTURES_DIR);

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s is valid and contains no player identifiers", (file) => {
    const json = JSON.parse(readFileSync(file, "utf8"));
    expect(FixtureSchema.safeParse(json).success).toBe(true);
    expect(findIdentifiers(json)).toEqual([]);
  });
});
