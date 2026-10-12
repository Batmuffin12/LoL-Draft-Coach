import type { MatchSummary, ParticipantSummary, Position, UserMatch } from "@ldc/shared";

/**
 * A synthetic match history for dev runs, benchmarks and screenshots (LDC_PROFILE_FILE): the same
 * games for the same seed and anchor time, with nobody's real data in it. Champion, item, rune and
 * spell ids are real ones so the panel can draw them; they are test data only.
 *
 *   history({ now: Date.now(), games: 150 }) → { matches, masteries }
 */

export interface HistorySpec {
  /** Epoch ms the newest game ends just before (games go back from here). */
  now: number;
  /** Number of games (default 150). */
  games?: number;
  /** Days the games are spread over (default 75). */
  days?: number;
  /** PRNG seed (default 1). */
  seed?: number;
  /** Your roles and champions with their share of games, most played first. */
  pool?: { role: Position; share: number; champions: { championId: number; share: number; winRate: number }[] }[];
}

export interface SyntheticHistory {
  matches: UserMatch[];
  masteries: { championId: number; level: number; points: number; lastPlayTime: number; grades: string[] }[];
}

/** Default pool: a mid main with a top secondary and a little jungle (ids as in scenarios/_world.ts). */
const DEFAULT_POOL: NonNullable<HistorySpec["pool"]> = [
  {
    role: "middle",
    share: 0.6,
    champions: [
      { championId: 103, share: 0.45, winRate: 0.56 },
      { championId: 245, share: 0.25, winRate: 0.52 },
      { championId: 99, share: 0.18, winRate: 0.48 },
      { championId: 238, share: 0.12, winRate: 0.45 },
    ],
  },
  {
    role: "top",
    share: 0.28,
    champions: [
      { championId: 86, share: 0.6, winRate: 0.54 },
      { championId: 122, share: 0.4, winRate: 0.47 },
    ],
  },
  { role: "jungle", share: 0.12, champions: [{ championId: 32, share: 1, winRate: 0.5 }] },
];

const ROLES: Position[] = ["top", "jungle", "middle", "bottom", "utility"];
/** Other champions per role, for the nine other seats. */
const OTHERS: Record<Position, number[]> = {
  top: [86, 122, 266, 54],
  jungle: [32, 64, 59],
  middle: [103, 238, 157, 84, 245, 99],
  bottom: [51, 81, 222, 119],
  utility: [111, 412, 25, 12],
};
/** Completed items per role (Data Dragon ids). */
const ITEMS: Record<Position, number[]> = {
  top: [3078, 6333, 3053, 3047, 3742, 3065],
  jungle: [3078, 6333, 3053, 3047, 3742, 3065],
  middle: [6655, 4645, 3157, 3020, 3089, 3135, 3118, 4646],
  bottom: [6672, 3031, 3006, 3094, 3036, 3072],
  utility: [3190, 3109, 3117, 3050, 3222, 2065],
};
const PAGES: Record<Position, ParticipantSummary["perks"]> = {
  top: { primaryStyle: 8000, subStyle: 8400, runes: [8010, 9111, 9104, 8299, 8444, 8451], statPerks: [5011, 5008, 5005] },
  jungle: { primaryStyle: 8100, subStyle: 8000, runes: [8112, 8143, 8138, 8135, 9111, 9104], statPerks: [5011, 5008, 5005] },
  middle: { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8140, 8106, 8226, 8210], statPerks: [5011, 5008, 5008] },
  bottom: { primaryStyle: 8000, subStyle: 8100, runes: [8008, 9111, 9104, 8017, 8139, 8135], statPerks: [5011, 5008, 5005] },
  utility: { primaryStyle: 8400, subStyle: 8300, runes: [8439, 8446, 8473, 8453, 8345, 8347], statPerks: [5011, 5008, 5008] },
};
const SPELLS: Record<Position, number[]> = { top: [4, 12], jungle: [4, 11], middle: [4, 14], bottom: [4, 7], utility: [4, 14] };
const GRADES = ["S+", "S", "S-", "A+", "A", "A-", "B+", "B"];

/** Small seeded PRNG (mulberry32): the same seed gives the same history. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function history(spec: HistorySpec): SyntheticHistory {
  const rand = prng(spec.seed ?? 1);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const weighted = <T extends { share: number }>(xs: T[]): T => {
    let r = rand() * xs.reduce((s, x) => s + x.share, 0);
    for (const x of xs) if ((r -= x.share) <= 0) return x;
    return xs[xs.length - 1]!;
  };
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.round(between(lo, hi));
  const pool = spec.pool ?? DEFAULT_POOL;
  const count = spec.games ?? 150;
  const spanMs = (spec.days ?? 75) * 86_400_000;
  const matches: UserMatch[] = [];
  const played = new Map<number, { games: number; last: number }>();

  // Sessions of a few games close together, so session checks and "last game" have something real.
  let t = spec.now - 3_600_000;
  for (let g = 0; g < count; g++) {
    const roleSpec = weighted(pool);
    const mine = weighted(roleSpec.champions);
    const durationSec = int(1_300, 2_200);
    const endedAt = Math.round(t);
    // A short break inside a session, or (three in ten) the gap until the session before.
    t -= durationSec * 1000 + (rand() < 0.3 ? between(4 * 3_600_000, (5 * spanMs) / count) : between(120_000, 600_000));
    const win = rand() < mine.winRate;
    const myTeam = rand() < 0.5 ? 100 : 200;
    const { participants, me } = seats(roleSpec.role, mine.championId, myTeam, win, durationSec);
    const match: MatchSummary = {
      matchId: `SIM1_${7_000_000_000 + count - g}`,
      queueId: rand() < 0.8 ? 420 : 440,
      gameVersion: "16.19.700.1234",
      endedAt,
      durationSec,
      participants,
      bans: [100, 200].flatMap((teamId) => [0, 1, 2, 3, 4].map(() => ({ teamId, championId: pick(Object.values(OTHERS).flat()) }))),
    };
    matches.push({ match, me });
    const p = played.get(mine.championId) ?? { games: 0, last: 0 };
    played.set(mine.championId, { games: p.games + 1, last: Math.max(p.last, endedAt) });
  }

  const masteries = [...played].map(([championId, p]) => ({
    championId,
    level: Math.min(10, 1 + Math.floor(p.games / 4)),
    points: p.games * 2_400 + int(0, 2_000),
    lastPlayTime: p.last,
    grades: [pick(GRADES), pick(GRADES)],
  }));
  return { matches, masteries };

  /** The ten seats of one game: you in your role on your team, the others from each role's champions, no champion twice. */
  function seats(myRole: Position, myChampion: number, myTeam: number, win: boolean, durationSec: number): { participants: ParticipantSummary[]; me: number } {
    const used = new Set<number>([myChampion]);
    const participants: ParticipantSummary[] = [];
    let me = 0;
    for (const teamId of [100, 200]) {
      for (const role of ROLES) {
        const isMe = teamId === myTeam && role === myRole;
        let championId = myChampion;
        if (!isMe) {
          const options = OTHERS[role]!.filter((c) => !used.has(c));
          championId = options.length ? pick(options) : pick(Object.values(OTHERS).flat().filter((c) => !used.has(c)));
          used.add(championId);
        } else me = participants.length;
        participants.push(participant(championId, teamId, role, teamId === myTeam ? win : !win, durationSec));
      }
    }
    return { participants, me };
  }

  function participant(championId: number, teamId: number, role: Position, won: boolean, durationSec: number): ParticipantSummary {
    const min = durationSec / 60;
    const support = role === "utility";
    const jungle = role === "jungle";
    const kills = int(0, support ? 4 : 11) + (won ? 2 : 0);
    const deaths = int(1, 9) - (won ? 1 : 0);
    const assists = int(2, support ? 20 : 12) + (won ? 3 : 0);
    const cs = Math.round(min * (support ? between(0.8, 1.8) : between(5.2, 8.4)));
    const physical = role === "middle" ? int(1_500, 6_000) : int(8_000, 22_000);
    const magic = role === "middle" ? int(12_000, 30_000) : int(1_000, 7_000);
    const items = [...ITEMS[role]!].sort(() => rand() - 0.5).slice(0, Math.min(6, 2 + Math.floor(min / 7)));
    while (items.length < 6) items.push(0);
    items.push(3340);
    return {
      championId,
      teamId,
      position: role,
      win: won,
      kills,
      deaths: Math.max(0, deaths),
      assists,
      cs,
      gold: Math.round(min * between(320, 460)),
      visionScore: Math.round(min * (support ? between(1.8, 2.8) : between(0.5, 1.2))),
      physicalDamage: physical,
      magicDamage: magic,
      trueDamage: int(300, 2_500),
      damageTaken: int(10_000, 35_000),
      selfMitigated: int(5_000, 30_000),
      ccSeconds: int(5, 60),
      objectiveDamage: int(jungle ? 20_000 : 2_000, jungle ? 60_000 : 15_000),
      heal: int(1_000, 9_000),
      items,
      spells: [...SPELLS[role]!],
      perks: PAGES[role] ?? null,
      earlyDeaths: int(0, 2),
      challenges: challenges(role, min, deaths, physical, magic),
    };
  }

  /** Match-V5 challenge metrics for one seat (the ones the engine reads). */
  function challenges(role: Position, min: number, deaths: number, physical: number, magic: number): Record<string, number> {
    const support = role === "utility";
    const jungle = role === "jungle";
    return {
      killParticipation: between(0.3, 0.75),
      teamDamagePercentage: between(0.12, 0.34),
      damagePerMinute: (physical + magic) / min,
      soloKills: int(0, 3),
      takedownsFirstXMinutes: int(0, 4),
      earlyLaningPhaseGoldExpAdvantage: int(0, 1),
      laningPhaseGoldExpAdvantage: int(0, 1),
      maxCsAdvantageOnLaneOpponent: between(-10, 30),
      turretPlatesTaken: int(0, 4),
      killsOnLanersEarlyJungleAsJungler: jungle ? int(0, 4) : 0,
      enemyJungleMonsterKills: int(0, jungle ? 20 : 3),
      laneMinionsFirst10Minutes: support || jungle ? int(0, 10) : int(50, 85),
      jungleCsBefore10Minutes: jungle ? int(40, 70) : 0,
      goldPerMinute: between(320, 460),
      visionScorePerMinute: support ? between(1.8, 2.8) : between(0.5, 1.2),
      controlWardsPlaced: int(0, support ? 8 : 3),
      wardTakedowns: int(0, 8),
      visionScoreAdvantageLaneOpponent: between(-0.5, 0.5),
      deathsByEnemyChamps: Math.max(0, deaths),
      dragonTakedowns: int(0, 4),
      riftHeraldTakedowns: int(0, 2),
      baronTakedowns: int(0, 1),
      turretTakedowns: int(0, 5),
      killsOnOtherLanesEarlyJungleAsLaner: int(0, 2),
      getTakedownsInAllLanesEarlyJungleAsLaner: int(0, 1),
      moreEnemyJungleThanOpponent: between(-5, 5),
      initialCrabCount: jungle ? int(0, 2) : 0,
    };
  }
}
