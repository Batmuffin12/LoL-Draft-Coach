import type { CoachStatus, FactorScores, Term } from "@ldc/shared";

/** IPC channel names between main and renderer. */
export const IPC = {
  state: "coach:state",
  ready: "coach:ready",
  setDocked: "coach:set-docked",
  register: "coach:register",
  signOut: "coach:sign-out",
  deleteData: "coach:delete-data",
  importLoadout: "coach:import-loadout",
} as const;

export interface ChampView {
  id: number;
  name: string;
  iconUrl: string | null;
}

/** A champ select seat as the panel shows it: champion and position only, never a player. */
export interface SlotView {
  cellId: number;
  position: string;
  champion: ChampView | null;
  hover: ChampView | null;
  isLocalPlayer: boolean;
  /** Type of the in-progress action for this seat ("pick", "ban"…), or null. */
  actingType: string | null;
}

export interface DraftView {
  timerPhase: string;
  timeLeftMs: number;
  /** Full length of the current phase (the first timeLeftMs seen in it), for the draining line. */
  totalSeconds: number;
  /** Epoch ms when this snapshot was produced, for a local countdown. */
  receivedAt: number;
  myTeam: SlotView[];
  theirTeam: SlotView[];
  myBans: ChampView[];
  theirBans: ChampView[];
  /** The local player has an in-progress action of this type ("pick", "ban"), or null. */
  localAction: string | null;
}

/** One reason as shown: caveats (the pick's weak point) are negative. */
export interface ReasonView {
  text: string;
  negative: boolean;
}

export interface PickView {
  champion: ChampView;
  score: number;
  /** Predicted win chance in this draft (live meta), or null without a meta snapshot. */
  expectedWin: number | null;
  factors: FactorScores;
  /** Engine v2: the parts of the win chance, in points with their games (empty without live meta). */
  terms: Term[];
  reasons: ReasonView[];
  offMeta: boolean;
}

/** An item, rune or summoner spell as the loadout shows it (Data Dragon name and icon). */
export interface IconView {
  id: number;
  name: string;
  iconUrl: string | null;
}

export interface LoadoutItemView extends IconView {
  reasons: string[];
}

/** An item option with its numbers: how often players take it, and the win it adds (null with thin data). */
export interface ItemOptionView extends LoadoutItemView {
  /** Share of the champion-role's games that take it (at this slot, or among boots). */
  share: number;
  winAdded: number | null;
}

/** A rune path drawn whole: its runes per row in Data Dragon slot order (keystones first on the primary path). */
export interface RuneTreeView {
  style: IconView;
  rows: IconView[][];
}

/** Win rate and games of a loadout choice; winRate is null with thin data (no win rates quoted, D31). */
export interface ChoiceNumbers {
  winRate: number | null;
  games: number;
}

/** Runes, spells, skill order and items for the locked-in champion (live meta only). */
export interface LoadoutView {
  /** Games behind the build (your band plus the one above). */
  games: number;
  /** Band names the build comes from, e.g. "Gold to Platinum + Emerald to Diamond". */
  source: string;
  /** Shown when the build rests on few games, e.g. "Not much data yet: treat it as a rough guide". */
  thinNote: string | null;
  page: {
    primary: IconView;
    secondary: IconView;
    /** Keystone first, then the other primary runes, then the secondary runes. */
    runes: IconView[];
    /** Stat shards as the client lists them (offense, flex, defense); names from the client. Empty without them. */
    shards: IconView[];
    reason: string | null;
    /** Both paths whole, so the page can be drawn on its trees (null without Data Dragon). */
    primaryTree: RuneTreeView | null;
    secondaryTree: RuneTreeView | null;
    /** All stat shard rows (offense, flex, defense) and the chosen index in each (-1: unknown); null when the client doesn't list them. */
    shardRows: { rows: IconView[][]; chosen: number[] } | null;
  } & ChoiceNumbers | null;
  situationalRunes: LoadoutItemView[];
  spells: ({ spells: IconView[]; reason: string | null } & ChoiceNumbers) | null;
  /** Skill keys, e.g. first ["Q", "E", "W"], max order ["Q", "E", "W"]. */
  /** `basic`: the three basic ability keys (grid rows), `ult`: the ultimate's key (levels 6, 11, 16). */
  skills: ({ first: string[]; order: string[]; basic: string[]; ult: string; reason: string | null } & ChoiceNumbers) | null;
  /** Starting items without repeats; counts[i] is how many of items[i] (e.g. 2 potions). */
  starting: ({ items: IconView[]; counts: number[]; reason: string | null } & ChoiceNumbers) | null;
  /** Thin data: later items to pick from by situation (after the core), each with its reason. */
  laterPool: LoadoutItemView[];
  laterNote: string | null;
  /** Items to buy against this enemy team (e.g. magic resist vs magic damage), with the reason. */
  situational: LoadoutItemView[];
  /** What your role quest turns items of this loadout into (e.g. tier-3 boots in mid). */
  quest: LoadoutItemView[];
  /** Boots on their own row, with other boots players take. */
  boots: { top: ItemOptionView; alternatives: ItemOptionView[] } | null;
  /** The ranked build path: per slot its average minute, the top item and alternatives, each with reasons and numbers. */
  items: { slot: number; minute: number | null; top: ItemOptionView; alternatives: ItemOptionView[] }[];
  /** The most common path, shown when there are too few purchases to rank items. */
  commonPath: { items: IconView[]; reason: string | null } | null;
  /** One-click import into the League client (only on your click), when enabled. */
  canImport: boolean;
}

/** Your champion against (or with) one champion of the draft; champion null: that seat hasn't picked. */
export interface MatchupRowView {
  champion: ChampView | null;
  /** The role it (most likely) plays: the client hides enemy roles, so the engine guesses them. */
  role: string;
  /** Your lane opponent. */
  lane: boolean;
  /** Your win rate in games with this pair, or null without games. */
  winRate: number | null;
  /** Points of win chance over what the two champions' strength predicts, or null without games. */
  delta: number | null;
  games: number;
}

/** The champion the local player has locked in, and how it looks in this draft. */
export interface MyPickView {
  champion: ChampView;
  role: string | null;
  /** Predicted win chance in this draft (live meta only). */
  expectedWin: number | null;
  reasons: ReasonView[];
  loadout: LoadoutView | null;
  /** The result of the last import click (e.g. "Rune page created"), or null. */
  importMessage: string | null;
  /** True when the champion is only hovered (not locked in yet). */
  hovering?: boolean;
  /** Against each enemy (your lane first) and with each ally in the draft (live meta only). */
  matchups: { against: MatchupRowView[]; with: MatchupRowView[] } | null;
  /** How this game is likely to go: lane in a word, who scales, their damage and engage, your record vs your lane opponent. */
  plan: string[];
}

/** A suggested ban (ban phase, live meta only). */
export interface BanView {
  champion: ChampView;
  reasons: string[];
  /** Win chance it costs you, in points (negative), weighted by how often it's picked. */
  threat: number;
  /** Its win rate and pick rate in your band (in your role when it's played there), or null without games. */
  winRate: number | null;
  pickRate: number | null;
  /** How often it's banned in your band; null when the snapshot has no ban counts (older snapshots). */
  banRate: number | null;
}

/** The live meta the picks are based on. */
export type MetaView =
  | { state: "ready"; band: number; patch: string | null; matches: number; createdAt: number; offline: boolean }
  | { state: "error"; message: string };

export interface SessionView {
  /** "2 losses in a row. A short break before the next game usually helps." */
  text: string;
  /** Your own record after such streaks, when you have enough games to quote it. */
  record: string | null;
  /** When the session counts as over (epoch ms): the panel hides the suggestion then. */
  until: number;
}

/** A champion in the player's pool for a role. */
export interface PoolChampView {
  champion: ChampView;
  tier: "main" | "comfortable" | "learning" | "rusty";
  tierLabel: string;
  games: number;
  winRate: number | null;
}

/** A draft need the role's pool doesn't cover, with evidence from the player's losses. */
export interface PoolHoleView {
  text: string;
  evidence: string | null;
  /** e.g. "Lillia (learning) would cover it". */
  coveredBy: string | null;
}

/** One role in the lobby's role advice (information only; never sets positions). */
export interface RoleView {
  role: string;
  games: number;
  winRate: number;
  score: number;
  enoughData: boolean;
  /** The pool for this role in tiers (main first). */
  pool: PoolChampView[];
  holes: PoolHoleView[];
}

/**
 * Registration with the coach server (server mode). Null in dev-only direct mode,
 * where the app calls the Riot API itself.
 */
export interface AccountView {
  state: "unregistered" | "registering" | "registered" | "mismatch" | "error";
  /** The Riot ID this app is registered for (the player's own). */
  riotId: string | null;
  serverUrl: string | null;
  /** Prefill for the server address field. */
  defaultServerUrl: string | null;
  message: string | null;
}

/** One playstyle axis as the lobby shows it. */
export interface AxisView {
  axis: string;
  label: string;
  /** 0..100: average percentile against others in the role. */
  score: number;
  level: "high" | "mid" | "low";
  levelLabel: string;
  /** The metric that moves this axis most, e.g. "deaths per minute: you 0.3, typical 0.2". */
  detail: string | null;
  games: number;
}

/** The player's playstyle in one role. */
export interface PlaystyleView {
  role: string;
  games: number;
  axes: AxisView[];
}

/** The explanation for the pick list as a whole. */
export interface PickAdviceView {
  /** "Picked over your usual X because …", or null. */
  whyNot: string | null;
  confidence: { level: "clear" | "close" | "thin"; label: string } | null;
  /** Fewest games for a term to count (engine v2 config): meta for the champion, pair for matchups and duos. Below it, bars draw faint. */
  minGames?: { meta: number; pair: number };
}

/** The monthly report: trends over your games in the last month, never a verdict on one game. */
export interface MonthView {
  /** "Sep 7 – Oct 6". */
  period: string;
  games: number;
  /** "Trends over 64 games. One game moves these numbers very little." */
  footer: string;
  /** The summary tiles: games, win rate, rank, focus. */
  strip: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }[];
  /** The role whose style trends are shown ("Mid"), or null. */
  role: string | null;
  axes: { label: string; from: number | null; to: number }[];
  champions: { champion: ChampView; games: number; winRate: number; change: number | null }[];
  /** Focus targets met, then the current focus. */
  focus: { met: string[]; current: string | null };
}

/** A champion to learn next in a role. */
export interface NewChampView {
  champion: ChampView;
  /** Your main or comfortable champion it's most like. */
  like: ChampView | null;
  winRate: number;
  games: number;
  ease: 1 | 2 | 3;
  /** "Easy", "Med", "Hard". */
  easeLabel: string;
  /** False: you don't own it yet; null: unknown (no client). */
  owned: boolean | null;
  reasons: string[];
}

/** New champions for one of your roles. */
export interface NewChampRoleView {
  role: string;
  picks: NewChampView[];
  /** The champion you're already learning in the role: the picks are then for after it. */
  learning: {
    /** "Learning Lillia". */
    title: string;
    champion: ChampView | null;
    /** "3 of 7 games · 12 days left". */
    progress: string | null;
    /** "Next games: Liandry's Torment, then Rylai's Crystal Scepter. Keep your focus on deaths." */
    plan: string | null;
    /** "After Lillia", the head over the picks. */
    after: string;
    /** "one new champion per role at a time". */
    why: string;
  } | null;
  /** The first-games plan for the top suggestion (none while learning another). */
  plan: string | null;
}

/** One measurable focus on your main champion and role, with a target and your last games against it. */
export interface FocusView {
  /** The metric as players say it, capitalised ("CS per minute"). */
  label: string;
  /** The goal as a sentence: "More CS per minute", "Fewer deaths to champions". */
  title: string;
  /** "6.8 or more", "7.7 or fewer". */
  goalText: string;
  /** How the goal is set, from the configured step: "Your next step: 50% of the way to the average". */
  goalHint: string;
  /** "Ahri · Mid", or the role alone without a main champion. */
  on: string;
  you: number;
  target: number;
  typical: number;
  /** The same three, formatted for the metric ("6.2", "54%"). */
  youText: string;
  targetText: string;
  typicalText: string;
  /** "Rank average 6.0", or "Average in your games 6.0" when your rank's data was too thin. */
  typicalLine: string;
  lowerIsBetter: boolean;
  checkGames: number;
  /** Your last games, oldest first: whether each reached the target. */
  recent: boolean[];
  /** Why this metric (how much it separates wins from losses where you play). */
  why: string;
  /** Targets you already reached ("Deaths per minute: 0.5 → 0.4, target met"). */
  met: string[];
}

/** The last game against the advice the coach gave (the post-game card). The player's own data only. */
export interface PostGameView {
  champion: ChampView;
  role: string | null;
  /** When you locked in, and when the game ended (null until it's in your history). */
  lockedAt: number;
  endedAt: number | null;
  minutes: number | null;
  /** Null until the game is in your history (the server syncs it after the game). */
  result: "win" | "loss" | null;
  /** The picks suggested when you locked in, best first; `took` marks yours. */
  shown: { champion: ChampView; expectedWin: number | null; took: boolean }[];
  /** "Took the #1 pick", "Took suggestion #2" or "Your own pick". */
  verdict: string;
  followed: boolean;
  /** The term that mattered most (an edge, or a cost): describes the draft, never grades the game. */
  lines: ReasonView[];
  /** "Predicted 54% for Ahri when you locked in", or null without live meta. */
  prediction: string | null;
  /** Your focus metric in this game against its target (null without a focus, or before the game is in your history). */
  focus: { label: string; value: string; target: string; met: boolean } | null;
}

export interface ViewState {
  account: AccountView | null;
  status: CoachStatus;
  draft: DraftView | null;
  picks: PickView[];
  pickAdvice: PickAdviceView;
  /** Ban suggestions while the local player is banning (empty otherwise). */
  bans: BanView[];
  /** Extra bans for the champion the player hovers before or during bans (null when not hovering). */
  hoverBans: { champion: ChampView; bans: BanView[] } | null;
  /** Set once the local player has locked in a champion (suggestions stop then). */
  myPick: MyPickView | null;
  /** The loadout for the champion the player hovers before locking in (shown under the suggestions). */
  hoverPick: MyPickView | null;
  /** Null until a snapshot is loaded (or in dev-only direct mode, which has no meta). */
  meta: MetaView | null;
  /** Role the picks are for, if known. */
  pickRole: string | null;
  /** Your lane opponent in champ select (champion null: not picked yet), or null without a role. */
  laneOpponent: { role: string; champion: ChampView | null } | null;
  /** Your roles ranked by recent results, for the lobby. */
  roles: RoleView[];
  /** Your playstyle per role with enough games (most played first). */
  playstyle: PlaystyleView[];
  /** Your most recent game with logged advice, or null. */
  lastGame: PostGameView | null;
  /** Your growth focus, or null without enough games. */
  focus: FocusView | null;
  /** New champions per role (needs the band's live meta), roles in the lobby's order. */
  newChamps: NewChampRoleView[];
  /** The monthly report, or null without games in the last month. */
  month: MonthView | null;
  /** A break suggestion after a losing streak or a long session (your games only), until the session is over. */
  session: SessionView | null;
  notices: string[];
  docked: boolean;
  /** Position names as the client shows them, by Riot's id ("utility" → "support"), from the explain config. */
  roleLabels: Record<string, string>;
}

export function emptyViewState(): ViewState {
  return {
    account: null,
    status: { lcu: "searching", gameflowPhase: null, patch: null, band: null, profile: { state: "idle" } },
    draft: null,
    picks: [],
    pickAdvice: { whyNot: null, confidence: null },
    bans: [],
    hoverBans: null,
    myPick: null,
    hoverPick: null,
    meta: null,
    pickRole: null,
    laneOpponent: null,
    roles: [],
    playstyle: [],
    lastGame: null,
    focus: null,
    newChamps: [],
    month: null,
    session: null,
    notices: [],
    docked: true,
    roleLabels: {},
  };
}
