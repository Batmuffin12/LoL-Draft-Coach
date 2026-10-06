import { describe, expect, it } from "vitest";
import { deltaWin, MetaIndex } from "@ldc/engine";
import type { DraftSlot, DraftState, MetaSnapshot } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { banNumbers, draftMatchups } from "../src/main/stats-view";

const config = loadConfig(findConfigDir(__dirname));
const names: Record<number, string> = { 86: "Garen", 238: "Zed", 64: "Lee Sin", 103: "Ahri", 254: "Vi" };
const lookup = (id: number) => (names[id] ? { id, key: String(id), name: names[id]!, iconUrl: "" } : undefined);

/** Ahri (103) plays mid; Garen (86) top, Zed (238) mid, Lee Sin (64) and Vi (254) jungle. */
function index(withBans = true): MetaIndex {
  const stat = (championId: number, role: string, games: number, wins = games / 2) => ({ championId, role, games, wins, n: games });
  const snapshot: MetaSnapshot = {
    format: 1,
    band: 2,
    createdAt: 0,
    patch: "16.19",
    matches: 1000,
    newestMatchAt: 0,
    halfLifeDays: 10,
    roleGames: { top: 2000, jungle: 2000, middle: 2000, bottom: 2000, utility: 2000 },
    champions: [stat(103, "middle", 300), stat(86, "top", 500), stat(86, "middle", 10, 4), stat(238, "middle", 400, 220), stat(64, "jungle", 600), stat(254, "jungle", 200)],
    // Ahri into Zed: 60 of 100; with Vi: 30 of 50.
    matchups: [[103, "middle", 238, "middle", 100, 60, 100]],
    duos: [[103, "middle", 254, "jungle", 50, 30, 50]],
    attributes: [],
    references: {},
    traitCuts: { magic: 0.4, physical: 0.6, frontline: 0.5, engage: 0.5, heal: 0.5 },
    builds: [],
    ...(withBans ? { bans: [{ championId: 238, bans: 250, n: 250 }], banMatches: 1000 } : {}),
  };
  return new MetaIndex(snapshot, config.engine.rating);
}

const seat = (cellId: number, championId: number, position = "", pickIntentId = 0): DraftSlot => ({ cellId, championId, pickIntentId, position, isLocalPlayer: cellId === 2 });
const draft = (allies: DraftSlot[], enemies: DraftSlot[]): DraftState => ({
  timerPhase: "BAN_PICK",
  timeLeftMs: 30_000,
  isCustomGame: false,
  localCellId: 2,
  myTeam: [seat(2, 103, "middle"), ...allies],
  theirTeam: enemies,
  myBans: [],
  theirBans: [],
  actions: [],
});

describe("banNumbers", () => {
  it("gives the threat in points (negative) and the champion's rates in your role", () => {
    const n = banNumbers(index(), { championId: 238, threat: 0.2, reasons: [] }, "middle");
    expect(n.threat).toBeCloseTo(-deltaWin(0.2));
    expect(n.threat).toBeLessThan(0);
    expect(n.winRate).toBeCloseTo(0.55);
    expect(n.pickRate).toBeCloseTo(400 / 1000);
    expect(n.banRate).toBeCloseTo(0.25);
  });

  it("judges a champion not played in your role in its main role", () => {
    const n = banNumbers(index(), { championId: 64, threat: 0.1, reasons: [] }, "middle");
    expect(n.pickRate).toBeCloseTo(600 / 1000);
    expect(n.winRate).toBeCloseTo(0.5);
    expect(n.banRate).toBe(0); // ban data, never banned
  });

  it("has no ban rate when the snapshot has no ban counts (older snapshots)", () => {
    expect(banNumbers(index(false), { championId: 238, threat: 0.2, reasons: [] }, "middle").banRate).toBeNull();
  });
});

describe("draftMatchups", () => {
  it("puts your lane opponent first, with your win rate, edge and games", () => {
    const m = draftMatchups(draft([], [seat(5, 86), seat(6, 238), seat(7, 0), seat(8, 0), seat(9, 0)]), index(), 103, "middle", lookup)!;
    expect(m.against[0]).toMatchObject({ champion: { name: "Zed" }, role: "middle", lane: true, winRate: 0.6, games: 100 });
    expect(m.against[0]!.delta).toBeGreaterThan(0);
    expect(m.against[1]).toMatchObject({ champion: { name: "Garen" }, role: "top", lane: false, winRate: null, delta: null, games: 0 });
    // Three seats haven't picked: rows without a champion, in the roles still open.
    const open = m.against.filter((r) => r.champion === null);
    expect(open).toHaveLength(3);
    expect(open.map((r) => r.role)).not.toContain("middle");
    expect(open.map((r) => r.role)).not.toContain("top");
  });

  it("lists your allies (hovers included) with duo numbers, and their open seats without your role", () => {
    const m = draftMatchups(draft([seat(1, 0, "jungle", 254), seat(3, 0, "top")], [seat(5, 86)]), index(), 103, "middle", lookup)!;
    expect(m.with[0]).toMatchObject({ champion: { name: "Vi" }, role: "jungle", lane: false, winRate: 0.6, games: 50 });
    expect(m.with.slice(1)).toEqual([{ champion: null, role: expect.any(String), lane: false, winRate: null, delta: null, games: 0 }]);
    expect(["middle", "jungle"]).not.toContain(m.with[1]!.role);
  });

  it("is null without a role for you or your champion", () => {
    expect(draftMatchups(draft([], []), index(), 999, null, lookup)).toBeNull();
  });
});
