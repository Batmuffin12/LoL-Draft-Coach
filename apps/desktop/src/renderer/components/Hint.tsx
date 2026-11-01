import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import type { HintId } from "../../shared/ui-state";
import { nextVisit, type HintVisit } from "../first-use";
import { t } from "../format";
import { HINT_CLASS, HINT_YIELD } from "../hooks";
import { Notice } from "./Notice";

/** How long a hint is on screen before it counts as seen: one that had no room never was. */
const SEEN_AFTER_MS = 300;

/**
 * A screen's one-time hint: the Notice to put at the top of its scrolling area, or null. It counts as
 * seen once it has shown, so closing the app doesn't repeat it, and it stays until you dismiss it or leave.
 * Real data comes first: when the screen doesn't fit with the hint, the hint goes (and shows on a later
 * visit), and `useFitLevel` only starts shrinking the screen once it has.
 */
export function useHint(id: HintId | null, seen: readonly string[]): ReactNode {
  const [stored, setVisit] = useState<HintVisit>(() => nextVisit(null, id, seen));
  const visit = nextVisit(stored, id, seen);
  if (visit !== stored) setVisit(visit);
  const open = visit.open ? visit.id : null;
  const close = () => setVisit((v) => (v.open ? { ...v, open: false } : v));

  useLayoutEffect(() => {
    if (!open) return;
    const check = () => {
      const s = document.querySelector(".window .scroll");
      if (s && s.scrollHeight > s.clientHeight) close();
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener(HINT_YIELD, close);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener(HINT_YIELD, close);
    };
  });

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => window.coach.hintSeen(open), SEEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;
  return (
    <div className={`notices ${HINT_CLASS}`}>
      <Notice
        tone="info"
        dismissLabel={t("notice.dismiss")}
        onDismiss={() => {
          window.coach.hintSeen(open);
          close();
        }}
      >
        {t(`hint.${open}`)}
      </Notice>
    </div>
  );
}
