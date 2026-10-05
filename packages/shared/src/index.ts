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

/**
 * One explanation: a template id (wording lives in config/explain.v*.json) and the
 * values it shows. Values come from the engine only, so text can never invent a stat.
 */
export interface Reason {
  id: string;
  slots: Record<string, string | number>;
}

/** The parts of a rating-based (engine v2) score. */
export type TermName = "meta" | "lane" | "counter" | "synergy" | "team" | "personal";

/** One part of a pick's predicted win chance, in rating points (log-odds × 400 / ln 10). */
export interface Term {
  name: TermName;
  /** Weighted rating points this term adds (negative = hurts). */
  rating: number;
  /** The same as a change in win chance at 50% (0.021 = +2.1 points). */
  deltaWin: number;
  /** Games behind the term's statistic (0 when it has no data). */
  games: number;
}

export interface PickRecommendation {
  championId: ChampionId;
  /** Weighted total in [0, 1] (engine v2: the predicted win chance). */
  score: number;
  /** Engine v2 only: predicted win chance in this draft, and its parts. */
  expectedWin?: number;
  terms?: Term[];
  factors: FactorScores;
  /** The data behind the score, most important first. */
  reasons: Reason[];
  /** The player plays it in this role, but it isn't a recommended/meta role for the champion. */
  offMeta: boolean;
}

/** A suggested ban: how much of a threat the champion is to you in this band, and why. */
export interface BanSuggestion {
  championId: ChampionId;
  /** Expected rating points the champion costs you, weighted by how often it's picked. */
  threat: number;
  reasons: Reason[];
}

/** How sure the top pick is: a clear gap, a close call, or thin data. */
export type PickConfidence = "clear" | "close" | "thin";

/** The ranked picks plus the explanation for the list as a whole. */
export interface PickAdvice {
  picks: PickRecommendation[];
  /** Why #1 beats the player's usual pick for this role (null when #1 is the usual pick). */
  whyNot: Reason | null;
  /** Confidence in #1 (null when there are no picks). */
  confidence: PickConfidence | null;
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
  /**
   * Champions banned in the game, per team. Absent on games stored before bans were kept
   * (they don't count toward ban rates); an empty list means the game had no bans.
   */
  bans?: { teamId: number; championId: ChampionId }[];
}

/** A match from a user's own history, with which participant they were. */
export interface UserMatch {
  match: MatchSummary;
  /** Index into `match.participants`. */
  me: number;
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
  /** Win rate in short and long games (measured; band snapshots only). */
  powerCurve?: { early: { games: number; winRate: number }; late: { games: number; winRate: number } };
}

/** A champion in a role, in one rank band. Games and wins are recency-weighted sums. */
export interface ChampionRoleStat {
  championId: ChampionId;
  role: Position;
  games: number;
  wins: number;
  /** Unweighted number of games (for "not enough data" checks and display). */
  n: number;
}

/**
 * Two champions in a match, stored once per pair: [championA, roleA, championB, roleB,
 * games, winsOfA, n]. In `matchups` they were opponents (same role = lane matchup), in
 * `duos` allies. Games and wins are recency-weighted; n is the unweighted count.
 */
export type PairStat = [ChampionId, Position, ChampionId, Position, number, number, number];

/** A champion rising in a role: recent days compared with the rest of the window (unweighted). */
export interface TrendingChampion {
  championId: ChampionId;
  role: Position;
  /** What is rising: how often it's picked, how often it wins, or both. */
  rising: "pick" | "win" | "both";
  pickRate: { before: number; recent: number };
  winRate: { before: number; recent: number };
  games: { before: number; recent: number };
}

/**
 * The live meta for one rank band, published by the server about hourly. Built from
 * anonymous collected matches only (no player identities). The desktop scores drafts
 * from it locally.
 */
export interface MetaSnapshot {
  /** Snapshot format; bumped on breaking changes. */
  format: 1;
  band: RankBandId;
  createdAt: number;
  /** Most recent patch in the data ("major.minor" from Match-V5 gameVersion), if any. */
  patch: string | null;
  /** Matches behind the snapshot (unweighted). */
  matches: number;
  newestMatchAt: number | null;
  halfLifeDays: number;
  /** Recency-weighted games per role (all champions), for pick rates. */
  roleGames: Record<Position, number>;
  champions: ChampionRoleStat[];
  /**
   * Bans: recency-weighted ban count per champion, over `banMatches` (the weighted number
   * of games that carried ban data). Absent in snapshots made before bans were collected.
   */
  bans?: { championId: ChampionId; bans: number; n: number }[];
  banMatches?: number;
  /** Champions whose pick or win rate in a role is rising fast (recent days vs the rest of the window). */
  trending?: TrendingChampion[];
  matchups: PairStat[];
  duos: PairStat[];
  attributes: ChampionAttributes[];
  /**
   * Playstyle references: per role and metric, evenly spaced quantiles (min … max) of
   * the metric over all collected players in that role.
   */
  references: Record<Position, Record<string, { n: number; quantiles: number[] }>>;
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
