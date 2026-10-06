import type { CoachStatus, FactorScores } from "@ldc/shared";

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
  /** Epoch ms when this snapshot was produced, for a local countdown. */
  receivedAt: number;
  myTeam: SlotView[];
  theirTeam: SlotView[];
  myBans: ChampView[];
  theirBans: ChampView[];
  /** The local player has an in-progress action of this type ("pick", "ban"), or null. */
  localAction: string | null;
}

export interface PickView {
  champion: ChampView;
  score: number;
  /** Predicted win chance in this draft (live meta), or null without a meta snapshot. */
  expectedWin: number | null;
  factors: FactorScores;
  reasons: string[];
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
    reason: string | null;
  } | null;
  situationalRunes: LoadoutItemView[];
  spells: { spells: IconView[]; reason: string | null } | null;
  /** Skill keys, e.g. first ["Q", "E", "W"], max order ["Q", "E", "W"]. */
  skills: { first: string[]; order: string[]; reason: string | null } | null;
  starting: { items: IconView[]; reason: string | null } | null;
  /** What your role quest turns items of this loadout into (e.g. tier-3 boots in mid). */
  quest: LoadoutItemView[];
  /** Boots on their own row, with other boots players take. */
  boots: { top: LoadoutItemView; alternatives: LoadoutItemView[] } | null;
  /** The ranked build path: per slot the top item and alternatives, each with reasons. */
  items: { slot: number; top: LoadoutItemView; alternatives: LoadoutItemView[] }[];
  /** The most common path, shown when there are too few purchases to rank items. */
  commonPath: { items: IconView[]; reason: string | null } | null;
  /** One-click import into the League client (only on your click), when enabled. */
  canImport: boolean;
}

/** The champion the local player has locked in, and how it looks in this draft. */
export interface MyPickView {
  champion: ChampView;
  role: string | null;
  /** Predicted win chance in this draft (live meta only). */
  expectedWin: number | null;
  reasons: string[];
  loadout: LoadoutView | null;
  /** The result of the last import click (e.g. "Rune page created"), or null. */
  importMessage: string | null;
}

/** A suggested ban (ban phase, live meta only). */
export interface BanView {
  champion: ChampView;
  reasons: string[];
}

/** The live meta the picks are based on. */
export type MetaView =
  | { state: "ready"; band: number; patch: string | null; matches: number; createdAt: number; offline: boolean }
  | { state: "error"; message: string };

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
  /** Null until a snapshot is loaded (or in dev-only direct mode, which has no meta). */
  meta: MetaView | null;
  /** Role the picks are for, if known. */
  pickRole: string | null;
  /** Your roles ranked by recent results, for the lobby. */
  roles: RoleView[];
  /** Your playstyle per role with enough games (most played first). */
  playstyle: PlaystyleView[];
  notices: string[];
  docked: boolean;
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
    meta: null,
    pickRole: null,
    roles: [],
    playstyle: [],
    notices: [],
    docked: true,
  };
}
