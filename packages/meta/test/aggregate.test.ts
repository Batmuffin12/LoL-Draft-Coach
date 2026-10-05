import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MatchSummary, ParticipantSummary } from "@ldc/shared";
import { aggregateBand, newestPatch, parseMetaConfig, patchOf, quantiles } from "../src/index";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const config = parseMetaConfig(JSON.parse(readFileSync(new URL("../../../config/meta.v1.json", import.meta.url), "utf8")));
const cfg = { ...config.aggregation, minPairGames: 1, minAttributeSamples: 1, minReferenceSamples: 1, referenceQuantiles: 5 };
const base = { band: 2, now: NOW, config: cfg, metrics: [] as string[] };

const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

function participant(championId: number, position: string, teamId: number, win: boolean, extra: Partial<ParticipantSummary> = {}): ParticipantSummary {
  return {
    championId,
    teamId,
    position,
    win,
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 200,
    gold: 10_000,
    visionScore: 20,
    physicalDamage: 10_000,
    magicDamage: 5_000,
    trueDamage: 0,
    damageTaken: 20_000,
    selfMitigated: 10_000,
    ccSeconds: 10,
    objectiveDamage: 3_000,
    items: [],
    spells: [],
    perks: null,
    challenges: { killParticipation: 0.5 },
    ...extra,
  };
}

/** Blue team (100) champions 1..5 vs red (200) 11..15 in role order; `blueWins` decides. */
function match(id: string, blue: number[], red: number[], blueWins: boolean, ageDays = 0, extra: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: id,
    queueId: 420,
    gameVersion: "15.19.712.1234",
    endedAt: NOW - ageDays * DAY,
    durationSec: 1800,
    participants: [
      ...blue.map((c, i) => participant(c, ROLES[i]!, 100, blueWins)),
      ...red.map((c, i) => participant(c, ROLES[i]!, 200, !blueWins)),
    ],
    ...extra,
  };
}

const BLUE = [1, 2, 3, 4, 5];
const RED = [11, 12, 13, 14, 15];

describe("aggregateBand", () => {
  it("counts champion-role games and wins, pick rates per role, and the newest patch", () => {
    const s = aggregateBand({
      band: 2,
      matches: [match("A", BLUE, RED, true), match("B", BLUE, RED, false, 0, { gameVersion: "15.20.1.1" })],
      now: NOW,
      config: cfg,
      metrics: [],
    });
    expect(s.matches).toBe(2);
    expect(s.patch).toBe("15.20");
    expect(s.champions.find((c) => c.championId === 1)).toEqual({ championId: 1, role: "top", games: 2, wins: 1, n: 2 });
    expect(s.roleGames.top).toBe(4);
    expect(s.newestMatchAt).toBe(NOW);
  });

  it("stores each opponent pair once, from the lower champion id's side", () => {
    const s = aggregateBand({
      band: 2,
      matches: [match("A", BLUE, RED, true), match("B", RED, BLUE, true), match("C", BLUE, RED, true)],
      now: NOW,
      config: cfg,
      metrics: [],
    });
    // Champion 1 (top) vs 11 (top): 1 won A and C, lost B.
    expect(s.matchups.find((p) => p[0] === 1 && p[2] === 11)).toEqual([1, "top", 11, "top", 3, 2, 3]);
    expect(s.matchups.find((p) => p[0] === 11 && p[2] === 1)).toBeUndefined();
    // Cross-role opponents are kept too (counters), with their roles.
    expect(s.matchups.find((p) => p[0] === 1 && p[2] === 12)?.[3]).toBe("jungle");
    // Allies are duos: 1 and 2 won twice together.
    expect(s.duos.find((p) => p[0] === 1 && p[2] === 2)).toEqual([1, "top", 2, "jungle", 3, 2, 3]);
    expect(s.matchups).toHaveLength(25);
    expect(s.duos).toHaveLength(20);
  });

  it("weights games by recency and ignores games outside the window, remakes and unpositioned games", () => {
    const old = match("OLD", BLUE, RED, false, cfg.halfLifeDays);
    const remake = match("R", BLUE, RED, false, 0, { durationSec: 200 });
    const noRoles = match("N", BLUE, RED, false);
    noRoles.participants[0]!.position = "";
    const ancient = match("X", BLUE, RED, false, cfg.windowDays + 1);
    const s = aggregateBand({ band: 2, matches: [match("NEW", BLUE, RED, true), old, remake, noRoles, ancient], now: NOW, config: cfg, metrics: [] });
    expect(s.matches).toBe(2);
    const top = s.champions.find((c) => c.championId === 1)!;
    expect(top.n).toBe(2);
    expect(top.games).toBeCloseTo(1.5);
    expect(top.wins).toBeCloseTo(1);
  });

  it("drops pairs seen fewer than minPairGames times", () => {
    const s = aggregateBand({ band: 2, matches: [match("A", BLUE, RED, true)], now: NOW, config: { ...cfg, minPairGames: 2 }, metrics: [] });
    expect(s.matchups).toEqual([]);
    expect(s.duos).toEqual([]);
    expect(s.champions).toHaveLength(10);
  });

  it("publishes measured attributes and playstyle reference quantiles per role", () => {
    const games = [0, 1, 2, 3].map((i) => {
      const m = match(`M${i}`, BLUE, RED, i % 2 === 0);
      m.participants[0]!.challenges = { killParticipation: i / 4 };
      m.participants[5]!.challenges = { killParticipation: (i + 4) / 8 };
      return m;
    });
    const s = aggregateBand({ band: 2, matches: games, now: NOW, config: cfg, metrics: ["challenges.killParticipation", "-deathsPerMinute"] });
    const ref = s.references.top!["challenges.killParticipation"]!;
    expect(ref.n).toBe(8);
    expect(ref.quantiles).toHaveLength(5);
    expect(ref.quantiles[0]).toBe(0);
    expect(ref.quantiles[4]).toBe(0.875);
    expect(s.references.top!.deathsPerMinute?.n).toBe(8);
    const a = s.attributes.find((x) => x.championId === 1)!;
    expect(a.physicalShare).toBeCloseTo(2 / 3, 2);
    expect(a.roleShares).toEqual({ top: 1 });
  });

  it("caps reference values per role and metric, keeping the newest games", () => {
    const games = [0, 1, 2].map((i) => {
      const m = match(`M${i}`, BLUE, RED, true, i);
      for (const p of m.participants) p.challenges = { killParticipation: 1 - i / 10 };
      return m;
    });
    const s = aggregateBand({ ...base, matches: games, config: { ...cfg, referenceMaxSamples: 2 }, metrics: ["challenges.killParticipation"] });
    // Two newest top players: both from match M0 (age 0), value 1.
    expect(s.references.top!["challenges.killParticipation"]).toEqual({ n: 2, quantiles: [1, 1, 1, 1, 1] });
  });

  it("counts bans once per game, recency-weighted, over only the games that carried ban data", () => {
    const withBans = (id: string, bans: { teamId: number; championId: number }[], ageDays = 0) => match(id, BLUE, RED, true, ageDays, { bans });
    const s = aggregateBand({
      ...base,
      matches: [
        withBans("A", [{ teamId: 100, championId: 77 }, { teamId: 200, championId: 77 }, { teamId: 200, championId: 88 }]),
        withBans("B", [{ teamId: 100, championId: 77 }], cfg.halfLifeDays),
        withBans("C", []),
        match("OLD", BLUE, RED, true), // stored before bans were kept: not in the denominator
      ],
    });
    expect(s.matches).toBe(4);
    expect(s.banMatches).toBeCloseTo(2.5);
    expect(s.bans).toEqual([
      { championId: 77, bans: 1.5, n: 2 },
      { championId: 88, bans: 1, n: 1 },
    ]);
  });

  it("flags a champion whose pick and win rate rise in the recent days, not a stable one", () => {
    // Before (10 days ago): top 1 in 40 of 400 games, winning half. Recent (1 day): 40 of 100, winning 80%.
    const games: MatchSummary[] = [];
    for (let i = 0; i < 400; i++) games.push(match(`B${i}`, [i < 40 ? 1 : 9, 2, 3, 4, 5], RED, i % 2 === 0, 10));
    for (let i = 0; i < 100; i++) games.push(match(`R${i}`, [i < 40 ? 1 : 9, 2, 3, 4, 5], RED, i < 40 ? i % 5 !== 0 : i % 2 === 0, 1));
    const trendCfg = { ...cfg, trend: config.aggregation.trend };
    const s = aggregateBand({ ...base, matches: games, config: trendCfg });
    const one = s.trending?.find((t) => t.championId === 1);
    expect(one).toMatchObject({ role: "top", rising: "both", pickRate: { before: 0.1, recent: 0.4 }, winRate: { before: 0.5, recent: 0.8 }, games: { before: 40, recent: 40 } });
    expect(s.trending?.some((t) => t.championId === 11)).toBe(false); // their top 11: picked in every game, winning less
    // No earlier period yet (e.g. production's first days): nothing is trending.
    expect(aggregateBand({ ...base, matches: games.filter((m) => m.matchId.startsWith("R")), config: trendCfg }).trending).toEqual([]);
  });

  it("never carries player identifiers into the snapshot", () => {
    const m = match("A", BLUE, RED, true);
    (m.participants[0] as unknown as Record<string, unknown>).puuid = "SECRET-PUUID";
    const s = aggregateBand({ band: 2, matches: [m], now: NOW, config: cfg, metrics: [] });
    expect(JSON.stringify(s)).not.toContain("SECRET");
  });
});

describe("helpers", () => {
  it("reads patches and picks the newest numerically", () => {
    expect(patchOf("15.19.712.1234")).toBe("15.19");
    expect(patchOf("garbage")).toBeNull();
    expect(newestPatch(["15.9", "15.10", null, "14.24"])).toBe("15.10");
  });

  it("interpolates quantiles", () => {
    expect(quantiles([0, 10], 3)).toEqual([0, 5, 10]);
    expect(quantiles([], 3)).toEqual([]);
  });
});
