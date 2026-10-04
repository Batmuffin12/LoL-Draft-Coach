import type { CoachStatus, FactorScores } from "@ldc/shared";

/** IPC channel names between main and renderer. */
export const IPC = {
  state: "coach:state",
  ready: "coach:ready",
  setDocked: "coach:set-docked",
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

export interface ViewState {
  status: CoachStatus;
  draft: DraftView | null;
  picks: PickView[];
  /** Role the picks are for, if known. */
  pickRole: string | null;
  /** Your roles ranked by recent results, for the lobby. */
  roles: RoleView[];
  notices: string[];
  docked: boolean;
}

export function emptyViewState(): ViewState {
  return {
    status: { lcu: "searching", gameflowPhase: null, patch: null, band: null, profile: { state: "idle" } },
    draft: null,
    picks: [],
    pickRole: null,
    roles: [],
    notices: [],
    docked: true,
  };
}
