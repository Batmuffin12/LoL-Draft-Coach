import { useEffect, useState } from "react";
import type { ViewState } from "../../shared/view";
import { Button } from "../components/Button";
import { Window } from "../components/Window";
import { TOUR_CARDS, tourStep } from "../first-use";
import { cx, t } from "../format";
import { Header } from "./common";

/** One short line: what, then the detail. Numbered cards are steps to follow, in order. */
function Line({ prefix, mark, numbered }: { prefix: string; mark: string; numbered: boolean | undefined }) {
  return (
    <li className="tour-line">
      <b className={cx(numbered && "num")} aria-hidden={numbered ? undefined : true}>
        {mark}
      </b>
      <span>
        <span className="text">{t(`${prefix}.lead`)}</span> <span className="caption">{t(prefix)}</span>
      </span>
    </li>
  );
}

/** The short tour after connecting: what the coach does, how to use it, the numbers, what it never does. */
export function OnboardingScreen({ state, onClose }: { state: ViewState; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const card = TOUR_CARDS[step]!;
  const name = `tour.card${step + 1}`;
  const last = step === TOUR_CARDS.length - 1;
  const stepText = t("tour.stepOf", { n: step + 1, total: TOUR_CARDS.length });

  // Keyboard: focus stays on the way forward, the arrows move, Escape skips.
  useEffect(() => {
    document.querySelector<HTMLButtonElement>(".tour-actions .btn.primary")?.focus();
  }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => tourStep(s, 1));
      else if (e.key === "ArrowLeft") setStep((s) => tourStep(s, -1));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Window
      header={<Header state={state} />}
      footer={
        <div className="tour-nav">
          <button type="button" className="foot-link" onClick={onClose}>
            {t("tour.skip")}
          </button>
          <span className="tour-dots" role="img" aria-label={stepText} title={stepText}>
            {TOUR_CARDS.map((_, i) => (
              <span key={i} className={cx("d", i === step && "on")} />
            ))}
          </span>
          <span className="tour-actions">
            {step > 0 && <Button onClick={() => setStep(tourStep(step, -1))}>{t("tour.back")}</Button>}
            <Button variant="primary" onClick={last ? onClose : () => setStep(tourStep(step, 1))}>
              {t(last ? "tour.done" : "tour.next")}
            </Button>
          </span>
        </div>
      }
    >
      <section className="tour-card" aria-live="polite">
        <span className="t-title gold-bright">{t(`${name}.title`)}</span>
        <ul className="tour-lines">
          {Array.from({ length: card.lines }, (_, i) => (
            <Line key={`${step}-${i}`} prefix={`${name}.line${i + 1}`} mark={card.numbered ? String(i + 1) : "•"} numbered={card.numbered} />
          ))}
        </ul>
        {card.note && (
          <p className="tour-note">
            <span className="text">{t(`${name}.note.lead`)}</span> <span className="caption">{t(`${name}.note`)}</span>
          </p>
        )}
      </section>
    </Window>
  );
}
