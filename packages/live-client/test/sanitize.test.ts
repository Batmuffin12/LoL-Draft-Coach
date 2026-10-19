import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, identityKeys, leakedNames, LiveRecorder, playerNames, sanitizeLiveGame } from "../src/index";

/** A raw `allgamedata` response in Riot's format (their sample, with Riot ID fields as the client sends today). */
function raw(gameTime = 600) {
  const player = (name: string, tag: string, championName: string, team: string, position: string, extra: object = {}) => ({
    championName, isBot: false, isDead: false, level: 7, position, rawChampionName: `game_character_displayname_${championName}`,
    respawnTimer: 0, runes: { keystone: { id: 8010 } }, skinID: 0, summonerSpells: {}, team,
    summonerName: `${name}#${tag}`, riotId: `${name}#${tag}`, riotIdGameName: name, riotIdTagLine: tag,
    items: [{ canUse: false, consumable: false, count: 1, displayName: "Doran's Blade", itemID: 1055, price: 450, rawDescription: "x", rawDisplayName: "x", slot: 0 }],
    scores: { assists: 1, creepScore: 60, deaths: 0, kills: 2, wardScore: 3.5 },
    ...extra,
  });
  return {
    activePlayer: { abilities: {}, championStats: {}, currentGold: 812.5, fullRunes: {}, level: 7, summonerName: "Tuxedo#EUW", riotId: "Tuxedo#EUW", riotIdGameName: "Tuxedo", riotIdTagLine: "EUW" },
    allPlayers: [player("Tuxedo", "EUW", "Annie", "ORDER", "MIDDLE"), player("Gene", "NA1", "Garen", "CHAOS", "TOP"), player("Helper", "123", "Lulu", "ORDER", "UTILITY")],
    events: {
      Events: [
        { EventID: 0, EventName: "GameStart", EventTime: 0.05 },
        { EventID: 1, EventName: "ChampionKill", EventTime: 300, VictimName: "Gene", KillerName: "Tuxedo", Assisters: ["Helper"] },
        { EventID: 2, EventName: "ChampionKill", EventTime: 400, VictimName: "Tuxedo", KillerName: "Turret_T2_L_03_A", Assisters: [] },
        { EventID: 3, EventName: "DragonKill", EventTime: 500, DragonType: "Earth", Stolen: "False", KillerName: "Helper", Assisters: ["Tuxedo"] },
        { EventID: 4, EventName: "Ace", EventTime: 550, Acer: "Tuxedo", AcingTeam: "ORDER" },
      ],
    },
    gameData: { gameMode: "CLASSIC", gameTime, mapName: "Map11", mapNumber: 11, mapTerrain: "Default" },
  };
}

describe("sanitizeLiveGame", () => {
  const game = sanitizeLiveGame(raw())!;

  it("keeps what the scoreboard shows and finds you, with no names or Riot IDs anywhere", () => {
    expect(game.me).toBe(0);
    expect(game.myGold).toBe(812.5);
    expect(game.players[1]).toEqual({
      championName: "Garen", team: "CHAOS", position: "TOP", level: 7, isDead: false, respawnTimer: 0, isBot: false,
      items: [{ itemId: 1055, count: 1, slot: 0 }],
      scores: { kills: 2, deaths: 0, assists: 1, creepScore: 60, wardScore: 3.5 },
    });
    expect(leakedNames(game, playerNames(raw()))).toEqual([]);
    expect(identityKeys(game)).toEqual([]);
    expect(playerNames(raw())).toContain("Tuxedo#EUW");
  });

  it("points events at players by index, and keeps game objects as objects", () => {
    expect(game.events[1]).toEqual({ id: 1, type: "ChampionKill", time: 300, killer: 0, victim: 1, assisters: [2] });
    expect(game.events[2]).toMatchObject({ killer: null, victim: 0, detail: { killerObject: "Turret_T2_L_03_A" } });
    expect(game.events[3]).toMatchObject({ type: "DragonKill", killer: 2, assisters: [0], detail: { DragonType: "Earth", Stolen: "False" } });
    expect(game.events[4]).toMatchObject({ type: "Ace", killer: 0, detail: { AcingTeam: "ORDER" } });
  });

  it("drops an actor that is neither a player nor a game object", () => {
    const r = raw();
    r.events.Events.push({ EventID: 5, EventName: "ChampionKill", EventTime: 590, VictimName: "Gene", KillerName: "Someone Else", Assisters: ["Stranger"] });
    const g = sanitizeLiveGame(r)!;
    expect(g.events[5]).toEqual({ id: 5, type: "ChampionKill", time: 590, killer: null, victim: 1, assisters: [] });
    expect(JSON.stringify(g)).not.toContain("Someone Else");
  });

  it("returns null when there is no game (loading screen, other endpoints)", () => {
    expect(sanitizeLiveGame(null)).toBeNull();
    expect(sanitizeLiveGame({ errorCode: "RESOURCE_NOT_FOUND" })).toBeNull();
  });
});

describe("LiveRecorder", () => {
  it("keeps only sanitized snapshots, with the events of the last one", () => {
    let t = 0;
    const rec = new LiveRecorder(10, () => (t += 10_000));
    expect(rec.add(raw(600))).toBe(true);
    expect(rec.add({ nope: true })).toBe(false);
    rec.add(raw(610));
    const f = rec.fixture("test");
    expect(f.frames.map((x) => x.t)).toEqual([0, 10]);
    expect(f.events).toHaveLength(5);
    expect("events" in f.frames[0]!.game).toBe(false);
    expect(leakedNames(f, playerNames(raw()))).toEqual([]);
  });

  it("refuses to write a recording that still holds a name", () => {
    const rec = new LiveRecorder(10);
    const r = raw();
    // A champion name equal to a player's name can't be told apart: refuse rather than risk it.
    r.allPlayers[0]!.championName = "Gene";
    rec.add(r);
    expect(() => rec.fixture()).toThrow(/player name/);
  });
});

describe("committed live fixtures", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith(".json") ? [join(dir, n)] : []));

  it("hold no identity keys", () => {
    for (const f of files(FIXTURES_DIR)) expect(identityKeys(JSON.parse(readFileSync(f, "utf8"))), f).toEqual([]);
  });
});
