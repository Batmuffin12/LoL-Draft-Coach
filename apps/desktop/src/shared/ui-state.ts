/** The highlights on the live screens (champ select, locked in); each has its wording in the explain config ("ui.tour.live.<id>"). */
export const HIGHLIGHT_IDS = ["bans", "picks", "rune-options", "import"] as const;
export type HighlightId = (typeof HIGHLIGHT_IDS)[number];

export function isHighlightId(id: unknown): id is HighlightId {
  return (HIGHLIGHT_IDS as readonly unknown[]).includes(id);
}

/** What first use has already shown on this PC. Not tied to an account, so a sign-out doesn't replay it. */
export interface UiState {
  tourDone: boolean;
  /** Highlights already shown. Kept as plain strings: a newer version's ids survive going back a version. */
  highlightsSeen: string[];
}

export function emptyUiState(): UiState {
  return { tourDone: false, highlightsSeen: [] };
}
