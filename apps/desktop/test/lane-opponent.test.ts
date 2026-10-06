import { describe, expect, it } from "vitest";
import { MetaIndex } from "@ldc/engine";
import type { DraftSlot, DraftState, MetaSnapshot } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { laneOpponent } from "../src/main/personal-coach";

const config = loadConfig(findConfigDir(__dirname));

/** Garen (86) plays top, Zed (238) mid, Lee Sin (64) jungle. */
function index(): MetaIndex {
  const stat = (championId: number, role: string, games: number) => ({ championId, role, games, wins: games / 2, n: games });
  const snapshot: MetaSnapshot = {
    format: 1,
    band: 2,
    createdAt: 0,
    patch: "16.19",
    matches: 1000,
    newestMatchAt: 0,
    halfLifeDays: 10,
    roleGames: { top: 2000, jungle: 2000, middle: 2000, bottom: 2000, utility: 2000 },
    champions: [stat(86, "top", 500), stat(86, "middle", 10), stat(238, "middle", 400), stat(238, "top", 20), stat(64, "jungle", 600)],
    matchups: [],
    duos: [],
    attributes: [],
    references: {},
    traitCuts: { magic: 0.4, physical: 0.6, frontline: 0.5, engage: 0.5, heal: 0.5 },
    builds: [],
  };
  return new MetaIndex(snapshot, config.engine.rating);
}

const seat = (cellId: number, championId: number, position = ""): DraftSlot => ({ cellId, championId, pickIntentId: 0, position, isLocalPlayer: cellId === 2 });
const draft = (enemies: DraftSlot[]): DraftState => ({
  timerPhase: "BAN_PICK",
  timeLeftMs: 30_000,
  isCustomGame: false,
  localCellId: 2,
  myTeam: [seat(2, 0, "middle")],
  theirTeam: enemies,
  myBans: [],
  theirBans: [],
  actions: [],
});

describe("laneOpponent", () => {
  it("finds your lane opponent from the engine's role guess (the client hides enemy roles)", () => {
    const d = draft([seat(5, 86), seat(6, 238), seat(7, 64), seat(8, 0), seat(9, 0)]);
    expect(laneOpponent(d, "middle", index())).toBe(238);
    expect(laneOpponent(d, "top", index())).toBe(86);
  });

  it("is null while your opponent hasn't picked", () => {
    expect(laneOpponent(draft([seat(5, 86), seat(6, 64), seat(7, 0)]), "middle", index())).toBeNull();
  });

  it("without live meta, only trusts an enemy seat that shows the position", () => {
    expect(laneOpponent(draft([seat(5, 86), seat(6, 238)]), "middle", null)).toBeNull();
    expect(laneOpponent(draft([seat(5, 86, "top"), seat(6, 238, "middle")]), "middle", null)).toBe(238);
  });
});
