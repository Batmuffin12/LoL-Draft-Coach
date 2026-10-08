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
  /** Riot's 0–10 ratings from Data Dragon (absent if Riot drops them). */
  info?: { attack: number; defense: number; magic: number; difficulty: number };
  /** Riot's class tags ("Mage", "Assassin"…), as Data Dragon lists them. */
  tags?: string[];
}

/** An item from Data Dragon, reduced to what builds and item ranking need. */
export interface ItemInfo {
  id: number;
  name: string;
  iconUrl: string;
  /** Total cost in gold (components included). */
  gold: number;
  /** Items this one builds into, and its components. */
  into: number[];
  from: number[];
  tags: string[];
  /** Map ids (Riot's) where the item exists. */
  maps: string[];
  /** Can be bought in the shop (not hidden, not a quest or champion-only reward). */
  purchasable: boolean;
  /** Champion (Data Dragon id) the item is limited to, if any. */
  requiredChampion: string | null;
  stats: Record<string, number>;
}

/** A rune or rune path (style) from Data Dragon. */
export interface RuneInfo {
  id: number;
  name: string;
  iconUrl: string;
  /** The path (style) id; equals id for a path itself. */
  styleId: number;
}

/** A summoner spell from Data Dragon, keyed by its numeric id. */
export interface SpellInfo {
  id: number;
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

/** The parts of a rating-based (engine v2) score (also what the server accepts in the advice log). */
export const TERM_NAMES = ["meta", "lane", "counter", "synergy", "team", "personal"] as const;
export type TermName = (typeof TERM_NAMES)[number];

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

/** A champion as the coach saw it in one draft: its predicted win chance and the parts of it. */
export interface AdviceOption {
  championId: ChampionId;
  expectedWin: number | null;
  terms: Term[];
}

/**
 * What the coach showed when you locked in (the advice log). The player's own data only:
 * your pick and the picks suggested to you, never another player.
 */
export interface AdviceRecord {
  /** The League game id (from the client's gameflow session), to find the game in your Match-V5 history. */
  gameId: number;
  queueId: number | null;
  role: Position | null;
  band: RankBandId;
  /** Epoch ms when you locked in. */
  lockedAt: number;
  /** The champion you locked in. */
  pick: AdviceOption;
  /** The picks suggested when you locked in, best first. */
  shown: AdviceOption[];
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
  /** Health restored (Match-V5 totalHeal: self and allies). Absent on games stored before it was kept. */
  heal?: number;
  /** Item ids in slots 0–6 (0 = empty). */
  items: number[];
  /** Summoner spell ids. */
  spells: number[];
  /** Rune page, when Riot sent one. `statPerks` are in Riot's key order: defense, flex, offense. */
  perks: { primaryStyle: number; subStyle: number; runes: number[]; statPerks: number[] } | null;
  /** Numeric Match-V5 `challenges` metrics, as Riot names them; any may be missing. */
  challenges: Record<string, number>;
  /** Deaths to champions before the configured minute (engine `earlyDeathsMinute`), from the timeline; absent without one. */
  earlyDeaths?: number;
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
  /** What happened over time, when the collector fetched the match's timeline (only a share of games). */
  timeline?: MatchTimeline;
}

/** Item event kinds in a MatchTimeline: bought, sold, destroyed (used up or built into another item). */
export const ITEM_BOUGHT = 0;
export const ITEM_SOLD = 1;
export const ITEM_DESTROYED = 2;

/**
 * A Match-V5 timeline reduced to what builds and item ranking need, without any player
 * identifier. Participant indexes are positions in `MatchSummary.participants`.
 * Undone purchases and sales are already removed.
 */
export interface MatchTimeline {
  /** totalGold per participant at each frame (frame i is minute i). */
  gold: number[][];
  /** Item events in time order: [participant, second, kind (ITEM_*), itemId]. */
  items: [number, number, number, number][];
  /** Skill slots (1 = Q … 4 = R) per participant, in level-up order (normal level-ups only). */
  skills: number[][];
  /** Champion level per participant at each frame (absent in timelines stored before 2026-10-08). */
  levels?: number[][];
  /**
   * Champion kills in time order: [second, killer, victim, assists bitmask (bit i = participant i)];
   * killer is -1 when no champion got the kill. For power spikes and "when you die" (absent before 2026-10-08).
   */
  kills?: [number, number, number, number][];
  /** CS (lane minions + jungle monsters) per participant at each frame (absent before 2026-10-08). */
  cs?: number[][];
  /** Wards placed, in time order: [second, placer] (trinkets, sight and control wards; absent before 2026-10-08). */
  wards?: [number, number][];
  /**
   * Epic monsters taken (dragons, grubs, herald, baron...), in time order: [second, killer, assists
   * bitmask, killer team id]; killer is -1 without a champion (absent before 2026-10-08).
   */
  monsters?: [number, number, number, number][];
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
  /** Healing (self and allies) per minute, as a percentile among measured champions (0..1); absent without heal data. */
  heal?: number;
  /** Share of other players' samples per position (the player's own games excluded). */
  roleShares: Record<Position, number>;
  /** Number of other players' samples behind roleShares. */
  roleSamples: number;
  /** Win rate in short and long games (measured; band snapshots only). */
  powerCurve?: {
    early: { games: number; winRate: number };
    late: { games: number; winRate: number };
    /** Average gold lead over the lane opponent at minute 15 (from timelines), when measured. */
    goldAt15?: { games: number; diff: number };
  };
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
 * Enemy-team traits that situational runes and items answer. Measured per champion
 * (ChampionAttributes) and averaged over the enemy team; "high" means above the band's average.
 */
export type EnemyTrait = "magic" | "physical" | "frontline" | "engage" | "heal";

/** How often an option was taken, and how it did. Games and wins are recency-weighted; n is the unweighted count. */
export interface OptionStat {
  games: number;
  wins: number;
  n: number;
}

export interface RunePageStat extends OptionStat {
  primaryStyle: number;
  subStyle: number;
  /** Primary path runes (keystone first), then secondary path runes. */
  runes: number[];
  /** Stat shards in Riot's key order: defense, flex, offense. */
  statPerks: number[];
}

/**
 * A completed item bought as the champion's `slot`-th completed item (1 = first), from
 * timelines. `winAdded` is the result minus the expected win for the game state when it
 * was bought (minute and team gold difference), shrunk toward 0: never raw item win rate.
 */
export interface ItemSlotStat {
  itemId: number;
  slot: number;
  n: number;
  /** Share of the champion-role's games with this slot that bought this item there. */
  share: number;
  winAdded: number;
  /** Average minute it was completed. */
  minute: number;
}

/**
 * A rune or item taken more often when the enemy team is high in a trait than when it is
 * low (pick-rate ratio, smoothed). Found from data: anti-heal, magic resist and so on are
 * never listed in code.
 */
export interface SituationalLift {
  kind: "rune" | "item";
  id: number;
  trait: EnemyTrait;
  lift: number;
  /** Pick rate when the trait is high and when it is low (0..1). */
  high: number;
  low: number;
  /** Games behind the two rates. */
  n: number;
}

/** Builds for one champion in one role, from the band plus the band above (spec). */
export interface ChampionBuild {
  championId: ChampionId;
  role: Position;
  /** Games behind the build (unweighted) and how many of them had a timeline. */
  n: number;
  timelineN: number;
  games: number;
  wins: number;
  pages: RunePageStat[];
  spells: (OptionStat & { spells: number[] })[];
  /** First three skill points and the order the basic skills are maxed (slots 1 = Q … 3 = E). */
  skills: (OptionStat & { first: number[]; order: number[] })[];
  /** Items bought before leaving base at the start. */
  starting: (OptionStat & { items: number[] })[];
  /** The first completed items in order: three-item paths, then two-item paths. */
  core: (OptionStat & { items: number[] })[];
  items: ItemSlotStat[];
  lifts: SituationalLift[];
  /** Rune page into a lane opponent, when the matchup is common enough. */
  matchupPages: (RunePageStat & { enemy: ChampionId })[];
  /**
   * Into a lane opponent (timeline games, when the matchup is common enough): the most taken
   * starting items and how often each item was the first completed one. Absent in older snapshots.
   */
  matchupItems?: { enemy: ChampionId; games: number; starting: { items: number[]; n: number } | null; first: { itemId: number; n: number }[] }[];
}

/** Expected win for a team by minute and team gold difference (from timelines), for win added. */
export interface ExpectedWinTable {
  /** Bucket edges: minute < minutes[0] is bucket 0, and so on. */
  minutes: number[];
  goldDiff: number[];
  /** winRate[minuteBucket][goldBucket], smoothed. */
  winRate: number[][];
  n: number;
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
  /** Builds per champion-role (band plus the band above). Absent before builds were collected. */
  builds?: ChampionBuild[];
  /**
   * Which roles buy each item (share of the games it was bought or held in, per role), so
   * role-locked items (jungle companions, support quest items) stay in their role. Found from
   * data, never listed. Absent in older snapshots.
   */
  itemRoles?: Record<string, Record<Position, number>>;
  /**
   * Role quest rewards per role, found from data: items players in the role hold at the end of
   * games but almost never buy (e.g. upgraded boots from the mid quest). `share` = share of the
   * role's games that ended with the item. Absent in older snapshots.
   */
  roleRewards?: Record<Position, { itemId: number; share: number }[]>;
  /** Band-average enemy-team trait values: above it, a trait counts as high. */
  traitCuts?: Record<EnemyTrait, number>;
  expectedWin?: ExpectedWinTable;
  /**
   * Playstyle references: per role and metric, evenly spaced quantiles (min … max) of
   * the metric over all collected players in that role, and its importance: the win-rate gap
   * between the top and bottom halves (growth focus; absent in older snapshots).
   */
  references: Record<Position, Record<string, { n: number; quantiles: number[]; importance?: number }>>;
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
    | {
        state: "ready";
        games: number;
        role: Position | null;
        /** Server mode: older games still loading in the background (absent or 0: the history is complete). */
        backlog?: number;
      }
    | { state: "error"; message: string };
}
