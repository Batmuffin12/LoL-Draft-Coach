import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { isHighlightId, type HighlightId } from "../../shared/ui-state";
import { closeHighlight, highlightVisit, moveTour, placeCallout, placeNote, skipStep, spotlight, stepKey, type Box, type HighlightVisit, type TourRun, type TourStep } from "../first-use";
import { t } from "../format";
import { Button } from "./Button";

const targetOf = (id: string): Element | null => {
  const el = document.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
};

interface Spot {
  hole: Box | null;
  top: number;
  left: number;
  /** The target's own corners, for the ring around it; null: it has none. */
  radius?: string | null;
}

/**
 * Calls `measure` now and whenever the layout may have moved: the window resizes (docked zoom too), an
 * element changes size (`useFitLevel`, the callout) or the content changes (a notice arrives). At most once a frame.
 */
function useRemeasure(measure: () => void, target: string | null): void {
  const latest = useRef(measure);
  latest.current = measure;
  useLayoutEffect(() => latest.current());
  useEffect(() => {
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => latest.current());
    };
    const sizes = new ResizeObserver(soon);
    const panel = document.querySelector(".window");
    const scroll = document.querySelector(".window .scroll");
    if (panel) sizes.observe(panel);
    if (scroll) for (const child of scroll.children) sizes.observe(child);
    const el = target ? targetOf(target) : null;
    if (el) sizes.observe(el);
    const content = new MutationObserver(soon);
    if (panel) content.observe(panel, { childList: true, subtree: true });
    window.addEventListener("resize", soon);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      content.disconnect();
      window.removeEventListener("resize", soon);
    };
  }, [target]);
}

/** Where the spotlight and its callout go for this target, in the window as it is now. */
function measureSpot(target: Element | null, box: RefObject<HTMLElement | null>): Spot | null {
  const callout = box.current;
  if (!callout) return null;
  const view = { width: window.innerWidth, height: window.innerHeight };
  const hole = target ? spotlight(target.getBoundingClientRect(), view) : null;
  const { top, left } = placeCallout(hole, { width: callout.offsetWidth, height: callout.offsetHeight }, view);
  return { hole, top, left };
}

/** Where a live note and its ring go: off the target and off the block it explains, and off a footer with a button or Riot's notice in it. */
function measureNote(target: Element, box: RefObject<HTMLElement | null>): Spot | null {
  const note = box.current;
  if (!note) return null;
  const view = { width: window.innerWidth, height: window.innerHeight };
  const r = target.getBoundingClientRect();
  const footer = document.querySelector(".window .foot:has(.btn, .legal)")?.getBoundingClientRect() ?? null;
  const about = (target.closest(".section") ?? target).getBoundingClientRect();
  const corner = getComputedStyle(target).borderTopLeftRadius;
  return { hole: spotlight(r, view), ...placeNote({ target: r, about, footer, size: { width: note.offsetWidth, height: note.offsetHeight }, view }), radius: corner === "0px" ? null : corner };
}

function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const place = (s: Spot | null) => (s ? { top: s.top, left: s.left } : { visibility: "hidden" as const });
const holeStyle = (h: Box) => ({ top: h.top, left: h.left, width: h.width, height: h.height });

/**
 * The lobby tour over the real screen: everything dimmed but a cut-out around the step's element, with a
 * small callout beside it. The panel under it takes no clicks or focus until the tour ends. A step whose
 * target isn't on screen is passed. A draft ends it by leaving the lobby; `run` stays above, so it picks up afterwards.
 */
export function LobbyTour({ steps, run, onRun, onClose, docked }: { steps: TourStep[]; run: TourRun; onRun: (run: TourRun) => void; onClose: () => void; docked: boolean }) {
  const index = Math.min(run.index, steps.length - 1);
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const go = (delta: 1 | -1) => {
    const next = moveTour({ ...run, index }, delta, steps.length);
    if (next) onRun(next);
    else onClose();
  };

  useRemeasure(() => {
    const el = step.target ? targetOf(step.target) : null;
    if (step.target && !el) return onRun(skipStep({ ...run, index }, step.id));
    const next = measureSpot(el, box);
    setSpot((now) => (sameSpot(now, next) ? now : next));
  }, step.target ?? null);

  // The panel behind can't be clicked or tabbed to. It still measures as usual.
  useEffect(() => {
    const panel = document.querySelector(".window");
    panel?.setAttribute("inert", "");
    return () => panel?.removeAttribute("inert");
  }, []);

  // Focus stays in the callout, on the way forward.
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>(".btn.primary")?.focus();
  }, [step.id]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Tab") {
      // Tab goes round the callout's buttons.
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const at = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  };

  return (
    // A click beside the buttons doesn't take focus out of the callout, so the keys keep working.
    <div className="tour" onKeyDown={onKeyDown} onMouseDown={(e) => !(e.target as Element).closest("button") && e.preventDefault()}>
      <div className="tour-shield" aria-hidden="true" />
      {spot?.hole ? <div className="tour-hole" aria-hidden="true" style={holeStyle(spot.hole)} /> : <div className="tour-dim" aria-hidden="true" />}
      <div ref={box} className="tour-callout" role="dialog" aria-modal="true" aria-label={t("tour.reopen")} style={place(spot)}>
        <p className="tour-text" aria-live="polite">
          <span className="text">{t(`tour.${stepKey(step, docked)}.lead`)}</span> {t(`tour.${stepKey(step, docked)}`)}
          {step.end && <span className="text"> {t(`tour.${step.id}.end`)}</span>}
        </p>
        <div className="tour-nav">
          <button type="button" className="foot-link" onClick={onClose}>
            {t("tour.skip")}
          </button>
          <span className="micro tour-step">{t("tour.stepOf", { n: index + 1, total: steps.length })}</span>
          <span className="tour-actions">
            {index > 0 && (
              <Button small variant="ghost" onClick={() => go(-1)}>
                {t("tour.back")}
              </Button>
            )}
            <Button small variant="primary" onClick={() => go(1)}>
              {t(last ? "tour.done" : "tour.next")}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** How long a highlight is on screen before it counts as seen. */
const SEEN_AFTER_MS = 300;

/**
 * The live screens' first-time highlights: a ring on the real element and a small note beside it. These
 * must never get in the way of a draft, so nothing is dimmed, focus doesn't move and clicks go through to
 * the screen; only the × takes one. Any click closes it, and so does leaving the screen.
 */
export function LiveHighlight({ ids, seen }: { ids: HighlightId[]; seen: readonly string[] }) {
  const [visit, setVisit] = useState<HighlightVisit | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const current = visit?.key === ids.join() ? visit.current : null;

  useRemeasure(() => {
    const next = highlightVisit(visit, ids, seen, (id) => targetOf(id) !== null);
    if (next !== visit) setVisit(next);
    const el = next.current ? targetOf(next.current) : null;
    const found = el && measureNote(el, box);
    setSpot((now) => (sameSpot(now, found) ? now : found));
  }, current);

  useEffect(() => {
    if (!isHighlightId(current)) return;
    const timer = setTimeout(() => window.coach.highlightSeen(current), SEEN_AFTER_MS);
    const close = () => {
      window.coach.highlightSeen(current);
      setVisit((v) => v && closeHighlight(v));
    };
    window.addEventListener("pointerdown", close, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", close, true);
    };
  }, [current]);

  if (!current) return null;
  return (
    <>
      {spot?.hole && <div className="tour-ring" aria-hidden="true" style={{ ...holeStyle(spot.hole), ...(spot.radius ? { borderRadius: spot.radius } : {}) }} />}
      <div ref={box} className="tour-note" role="status" style={place(spot)}>
        <span>{t(`tour.live.${current}`)}</span>
        <button type="button" className="dismiss" title={t("notice.dismiss")} aria-label={t("notice.dismiss")}>
          ×
        </button>
      </div>
    </>
  );
}
