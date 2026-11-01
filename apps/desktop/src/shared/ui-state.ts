/** The screens with a one-time hint; each has its wording in the explain config ("ui.hint.<id>"). */
export const HINT_IDS = ["ban", "pick", "locked", "last", "me", "champions"] as const;
export type HintId = (typeof HINT_IDS)[number];

export function isHintId(id: unknown): id is HintId {
  return (HINT_IDS as readonly unknown[]).includes(id);
}

/** What first use has already shown on this PC. Not tied to an account, so a sign-out doesn't replay it. */
export interface UiState {
  tourDone: boolean;
  /** Hints already shown. Kept as plain strings: a newer version's ids survive going back a version. */
  hintsSeen: string[];
}

export function emptyUiState(): UiState {
  return { tourDone: false, hintsSeen: [] };
}
