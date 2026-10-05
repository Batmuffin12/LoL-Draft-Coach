/**
 * Data types shared by every package. These are logic-level shapes only;
 * no game facts (champions, tiers, queues…) are listed here.
 */

/** Numeric champion id as used by the LCU and Match-V5 (Data Dragon `key`). 0 means "none". */
export type ChampionId = number;

/**
 * A lane position as reported by the client / Match-V5, normalised to lower case
 * (e.g. the LCU's `assignedPosition` or Match-V5's `teamPosition`). Empty string = unknown.
 * Deliberately a string: the set of positions comes from live data, not from code.
 */
export type Position = string;

export function normalizePosition(raw: string | null | undefined): Position {
  return (raw ?? "").trim().toLowerCase();
}

/** Rank band id, as defined in config/rank-bands.v*.json. */
export type RankBandId = number;

/**
 * One champ select seat with all player identity removed.
 * This is the only player shape that may leave the LCU adapter (compliance rule).
 */
export interface DraftSlot {
  cellId: number;
  /** Locked or currently selected champion (0 if none). */
  championId: ChampionId;
  /** Champion the player is hovering / declared (0 if none). */
  pickIntentId: ChampionId;
  position: Position;
  isLocalPlayer: boolean;
}

export interface DraftAction {
  id: number;
  type: string;
  actorCellId: number;
  championId: ChampionId;
  completed: boolean;
  inProgress: boolean;
  isAllyAction: boolean;
}

/** Sanitised champ select state: champions and draft only, no player identities. */
export interface DraftState {
  /** Timer phase from the client, e.g. "BAN_PICK", "FINALIZATION". */
  timerPhase: string;
  timeLeftMs: number;
  isCustomGame: boolean;
  localCellId: number;
  myTeam: DraftSlot[];
  theirTeam: DraftSlot[];
  myBans: ChampionId[];
  theirBans: ChampionId[];
  actions: DraftAction[];
}

/** Static champion info resolved from Data Dragon for display. */
export interface ChampionInfo {
  id: ChampionId;
  /** Data Dragon string id, e.g. used for icon file names. */
  key: string;
  name: string;
  iconUrl: string;
}

/** Score breakdown per factor; null when the factor has no data yet. */
export interface FactorScores {
  comfort: number | null;
  laneMatchup: number | null;
  teamNeeds: number | null;
  counterValue: number | null;
  metaStrength: number | null;
}

export type FactorName = keyof FactorScores;

export interface PickRecommendation {
  championId: ChampionId;
  /** Weighted total in [0, 1]. */
  score: number;
  factors: FactorScores;
  /** Short, data-derived facts behind the score (no invented stats). */
  reasons: string[];
  /** The player plays it in this role, but it isn't a recommended/meta role for the champion. */
  offMeta: boolean;
}

/**
 * One participant of a stored match, reduced to what coaching needs. Never carries a
 * PUUID, name or any other identifier: who the user was is stored separately as an index.
 */
export interface ParticipantSummary {
  championId: ChampionId;
  teamId: number;
  position: Position;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** Lane minions + jungle monsters. */
  cs: number;
  gold: number;
  visionScore: number;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  damageTaken: number;
  selfMitigated: number;
  /** Seconds spent crowd-controlling others (Match-V5 timeCCingOthers). */
  ccSeconds: number;
  objectiveDamage: number;
  /** Item ids in slots 0–6 (0 = empty). */
  items: number[];
  /** Summoner spell ids. */
  spells: number[];
  /** Rune page, when Riot sent one. */
  perks: { primaryStyle: number; subStyle: number; runes: number[]; statPerks: number[] } | null;
  /** Numeric Match-V5 `challenges` metrics, as Riot names them; any may be missing. */
  challenges: Record<string, number>;
}

/** A stored match: game facts and the ten anonymised participants. */
export interface MatchSummary {
  matchId: string;
  queueId: number;
  gameVersion: string;
  endedAt: number;
  durationSec: number;
  participants: ParticipantSummary[];
}

/** A match from a user's own history, with which participant they were. */
export interface UserMatch {
  match: MatchSummary;
  /** Index into `match.participants`. */
  me: number;
}

/** Status shown in the panel. */
export type ConnectionState = "searching" | "connected" | "disconnected";

export interface CoachStatus {
  lcu: ConnectionState;
  gameflowPhase: string | null;
  patch: string | null;
  band: RankBandId | null;
  profile:
    | { state: "idle" }
    | { state: "loading"; done: number; total: number }
    | { state: "ready"; games: number; role: Position | null }
    | { state: "error"; message: string };
}
