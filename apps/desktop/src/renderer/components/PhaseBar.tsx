import { cx } from "../format";

export interface PhaseBarProps {
  timerPhase: string;
  /** The local player's turn ("pick", "ban"), or null. */
  localAction: string | null;
  secondsLeft: number;
  totalSeconds: number;
  /** The call when it isn't your turn ("Their team is picking"). */
  waitingText?: string;
  /** One line under the call: "Middle · against Zed". */
  context?: string | null;
}

const PHASE_LABEL: Record<string, string> = {
  PLANNING: "Declare your pick",
  BAN_PICK: "Champ select",
  FINALIZATION: "Finalization",
  GAME_STARTING: "Game starting",
};

/** Seconds left at which your turn's timer turns red. */
const URGENT_SECONDS = 10;
/** The ring: 64px with a 4px stroke. */
const RING = 64;
const STROKE = 4;
const R = (RING - STROKE) / 2 - 1;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** The band under the header: the timer ring, the phase, whose turn, and the lane fact the advice hinges on. Tinted on your turn only. */
export function PhaseBar({ timerPhase, localAction, secondsLeft, totalSeconds, waitingText, context }: PhaseBarProps) {
  const mine = localAction === "pick" || localAction === "ban";
  const left = Math.max(0, secondsLeft);
  const urgent = mine && left <= URGENT_SECONDS;
  const call = mine ? (localAction === "ban" ? "Your ban" : "Your pick") : (waitingText ?? "Waiting");
  const share = totalSeconds > 0 ? Math.max(0, Math.min(1, left / totalSeconds)) : null;
  return (
    <section className={cx("phase", mine && "mine")} aria-live="polite">
      <div className={cx("ring", urgent && "urgent")}>
        {share !== null && (
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true">
            <circle className="track" cx={RING / 2} cy={RING / 2} r={R} fill="none" strokeWidth={STROKE} />
            <circle
              className="left"
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - share)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </svg>
        )}
        <span className="t-hero n" aria-label={`${Math.ceil(left)} seconds left`}>
          {Math.ceil(left)}
        </span>
      </div>
      <div className="what">
        <span className="label">{PHASE_LABEL[timerPhase] ?? timerPhase}</span>
        <span className="t-title t-call call">{call}</span>
        {context && <span className="caption ctx">{context}</span>}
      </div>
    </section>
  );
}
