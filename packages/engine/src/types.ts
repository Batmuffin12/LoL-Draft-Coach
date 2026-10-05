import type { ChampionId, Position } from "@ldc/shared";

/** One of the player's own games (from Match-V5), reduced to what the engine needs. */
export interface PlayerGame {
  championId: ChampionId;
  position: Position;
  win: boolean;
  /** Epoch ms when the game ended. */
  endedAt: number;
}

/** The player's mastery on a champion (Champion-Mastery-V4). */
export interface MasteryEntry {
  championId: ChampionId;
  level: number;
  points: number;
  /** Epoch ms the champion was last played (Champion-Mastery-V4 lastPlayTime). */
  lastPlayTime?: number;
  /** End-of-game grades of the current mastery milestone (e.g. "S", "A+"). */
  grades?: string[];
}

/** One participant's stats from a match: the raw material for champion attributes. */
export interface AttributeSample {
  championId: ChampionId;
  position: Position;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  damageTaken: number;
  selfMitigated: number;
  /** Seconds spent crowd-controlling others (Match-V5 timeCCingOthers). */
  ccSeconds: number;
  durationSec: number;
  /** True for the player's own participant: excluded from role shares (what others play). */
  self?: boolean;
}

/** Attributes measured from match data (never labelled by hand). */
export interface ChampionAttributes {
  championId: ChampionId;
  samples: number;
  physicalShare: number;
  magicShare: number;
  trueShare: number;
  /** Damage taken + mitigated per minute, as a percentile among measured champions (0..1). */
  frontline: number;
  /** CC seconds per minute, as a percentile among measured champions (0..1). */
  engage: number;
  /** Share of other players' samples per position (the player's own games excluded). */
  roleShares: Record<Position, number>;
  /** Number of other players' samples behind roleShares. */
  roleSamples: number;
}

export interface ComfortStats {
  championId: ChampionId;
  games: number;
  /** Recency-weighted game count. */
  weightedGames: number;
  /** Raw win rate over all games (unweighted), for display. */
  winRate: number | null;
  /** Recency-weighted win rate smoothed toward the player's own average. */
  smoothedWinRate: number;
  masteryLevel: number | null;
  masteryPoints: number;
  grades: string[];
  /** Champion skill in [0, 1]: mastery, grades and long-window win rate, any role. */
  skill: number;
  /** Current form in [0, 1]: recent games and win rate in the role. */
  form: number;
  /** Comfort factor in [0, 1]. */
  score: number;
  gamesByPosition: Record<Position, number>;
  /** Role the stats were weighted for (null = all roles equally). */
  role: Position | null;
  /** Games and win rate in that role (null when no role). */
  gamesInRole: number | null;
  winRateInRole: number | null;
}
