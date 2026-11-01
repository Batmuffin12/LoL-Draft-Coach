import { useEffect, useState } from "react";
import type { LoadoutView, RunePageView } from "../shared/view";

/** Which rune option the player chose: a page key, because the options can reorder as the draft moves. */
export interface RuneChoice {
  key: string | null;
  choose: (key: string) => void;
}

/** The chosen rune option, kept across tabs and from hover to lock-in; back to the first one when the champion changes. */
export function useRuneChoice(championId: number | null): RuneChoice {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => setKey(null), [championId]);
  return { key, choose: setKey };
}

/** The page on screen: the chosen option while it's offered, otherwise the first page. */
export function shownPage(l: Pick<LoadoutView, "page" | "pageAlt">, key: string | null): RunePageView | null {
  return l.pageAlt?.key === key ? l.pageAlt : l.page;
}
