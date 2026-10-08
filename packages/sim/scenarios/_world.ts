/**
 * Shared test data for the scenarios: a mid-lane world around Ahri. The ids are real champion,
 * rune and item ids so the panel can draw them from Data Dragon; they are scenario data only.
 */
import { meta, type BuildSpec } from "../src/index";

export const C = {
  ahri: 103, zed: 238, yasuo: 157, akali: 84, ekko: 245, lux: 99,
  garen: 86, darius: 122, aatrox: 266, malphite: 54,
  amumu: 32, leeSin: 64, jarvan: 59,
  caitlyn: 51, ezreal: 81, jinx: 222, draven: 119,
  nautilus: 111, thresh: 412, morgana: 25, alistar: 12,
};

/** Ahri's build: Domination (Electrocute) + Sorcery, Flash/Ignite, max Q > W > E, Luden's first. */
export function ahriBuild(games: number): BuildSpec {
  return {
    games,
    winRate: 0.52,
    pages: [
      { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8140, 8106, 8226, 8210], statPerks: [5008, 5008, 5011], winRate: 0.53 },
      { primaryStyle: 8200, subStyle: 8100, runes: [8229, 8226, 8210, 8237, 8139, 8106], statPerks: [5008, 5008, 5011], winRate: 0.5 },
    ],
    spells: [{ spells: [4, 14], winRate: 0.53 }, { spells: [4, 12], winRate: 0.5 }],
    skills: [{ first: [1, 3, 2], order: [1, 2, 3], winRate: 0.52 }],
    starting: [{ items: [1056, 2003, 2003], winRate: 0.52 }],
    core: [{ items: [6655, 4645, 3157] }],
    items: [
      { itemId: 6655, slot: 1, share: 0.58, winAdded: 0.014, minute: 11 },
      { itemId: 3118, slot: 1, share: 0.27, winAdded: 0.004, minute: 12 },
      { itemId: 3020, slot: 2, share: 0.61, winAdded: 0.006, minute: 14 },
      { itemId: 4645, slot: 2, share: 0.44, winAdded: 0.009, minute: 18 },
      { itemId: 4646, slot: 2, share: 0.31, winAdded: 0.006, minute: 19 },
      { itemId: 3157, slot: 3, share: 0.38, winAdded: 0.011, minute: 24 },
      { itemId: 3089, slot: 3, share: 0.35, winAdded: 0.008, minute: 25 },
      { itemId: 3135, slot: 4, share: 0.41, winAdded: 0.007, minute: 29 },
    ],
  };
}

/** The band's meta: mid with solid numbers, Ahri's build with `ahriGames` games (thin below loadout.solidGames). */
export function world(ahriGames = 600) {
  return meta({ band: 2, patch: "16.19", matches: 21_400 })
    .champion(C.ahri, "middle", { games: 1900, winRate: 0.521 })
    .champion(C.zed, "middle", { games: 2300, winRate: 0.512 })
    .champion(C.yasuo, "middle", { games: 2600, winRate: 0.495 })
    .champion(C.akali, "middle", { games: 1500, winRate: 0.498 })
    .champion(C.ekko, "middle", { games: 1200, winRate: 0.517 })
    .champion(C.lux, "middle", { games: 900, winRate: 0.505 })
    .champion(C.garen, "top", { games: 1800, winRate: 0.515 })
    .champion(C.darius, "top", { games: 2000, winRate: 0.507 })
    .champion(C.aatrox, "top", { games: 1600, winRate: 0.496 })
    .champion(C.malphite, "top", { games: 1100, winRate: 0.52 })
    .champion(C.amumu, "jungle", { games: 1400, winRate: 0.523 })
    .champion(C.leeSin, "jungle", { games: 2400, winRate: 0.486 })
    .champion(C.jarvan, "jungle", { games: 1500, winRate: 0.505 })
    .champion(C.caitlyn, "bottom", { games: 2200, winRate: 0.503 })
    .champion(C.ezreal, "bottom", { games: 2600, winRate: 0.494 })
    .champion(C.jinx, "bottom", { games: 2100, winRate: 0.512 })
    .champion(C.draven, "bottom", { games: 900, winRate: 0.508 })
    .champion(C.nautilus, "utility", { games: 2100, winRate: 0.509 })
    .champion(C.thresh, "utility", { games: 2300, winRate: 0.497 })
    .champion(C.morgana, "utility", { games: 1300, winRate: 0.514 })
    .champion(C.alistar, "utility", { games: 800, winRate: 0.502 })
    .matchup(C.ahri, C.zed, "middle", { games: 1240, winRate: 0.531 })
    .matchup(C.ahri, C.yasuo, "middle", { games: 1100, winRate: 0.522 })
    .matchup(C.ekko, C.zed, "middle", { games: 640, winRate: 0.48 })
    .matchup(C.lux, C.zed, "middle", { games: 400, winRate: 0.45 })
    .matchup(C.akali, C.ahri, "middle", { games: 1010, winRate: 0.529 })
    .matchup(C.ahri, C.leeSin, "middle", { games: 900, winRate: 0.514, roleB: "jungle" })
    .duo(C.ahri, "middle", C.amumu, "jungle", { games: 640, winRate: 0.537 })
    .ban(C.zed, 0.21)
    .ban(C.yasuo, 0.16)
    .ban(C.akali, 0.09)
    .ban(C.leeSin, 0.07)
    .attribute(C.ahri, { role: "middle", physicalShare: 0.08, magicShare: 0.9, engage: 0.7 })
    .attribute(C.zed, { role: "middle", physicalShare: 0.92, magicShare: 0.05 })
    .attribute(C.lux, { role: "middle", physicalShare: 0.05, magicShare: 0.93, engage: 0.8 })
    .attribute(C.ekko, { role: "middle", physicalShare: 0.1, magicShare: 0.88 })
    .attribute(C.garen, { role: "top", physicalShare: 0.85, magicShare: 0.02, frontline: 0.8 })
    .attribute(C.leeSin, { role: "jungle", physicalShare: 0.9, magicShare: 0.05, engage: 0.6 })
    .attribute(C.caitlyn, { role: "bottom", physicalShare: 0.95, magicShare: 0.02 })
    .attribute(C.nautilus, { role: "utility", physicalShare: 0.4, magicShare: 0.55, frontline: 0.85, engage: 0.95 })
    .build(C.ahri, "middle", ahriBuild(ahriGames))
    .done();
}
