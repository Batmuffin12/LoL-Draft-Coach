import type { CoachStatus, FactorScores } from "@ldc/shared";

/** IPC channel names between main and renderer. */
export const IPC = {
  state: "coach:state",
  ready: "coach:ready",
  setDocked: "coach:set-docked",
  register: "coach:register",
  signOut: "coach:sign-out",
  deleteData: "coach:delete-data",
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
  factors: FactorScores;
  reasons: string[];
  offMeta: boolean;
}

/** One role in the lobby's role advice (information only; never sets positions). */
export interface RoleView {
  role: string;
  games: number;
  winRate: number;
  score: number;
  enoughData: boolean;
  champions: ChampView[];
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
    pickRole: null,
    roles: [],
    playstyle: [],
    notices: [],
    docked: true,
  };
}
