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

/** The band under the header: phase, whose turn, the lane fact the advice hinges on, and the countdown. */
export function PhaseBar({ timerPhase, localAction, secondsLeft, totalSeconds, waitingText, context }: PhaseBarProps) {
  const mine = localAction === "pick" || localAction === "ban";
  const left = Math.max(0, secondsLeft);
  const urgent = mine && left <= 10;
  const call = mine ? (localAction === "ban" ? "Your ban" : "Your pick") : (waitingText ?? "Waiting");
  const drain = totalSeconds > 0 ? Math.max(0, Math.min(1, left / totalSeconds)) * 100 : 0;
  return (
    <section className={cx("phase", mine && "mine")} aria-live="polite">
      <div className="what">
        <span className="label">{PHASE_LABEL[timerPhase] ?? timerPhase}</span>
        <span className="call">{call}</span>
        {context && <span className="ctx">{context}</span>}
      </div>
      <span className={cx("timer", urgent && "urgent")}>{Math.ceil(left)}</span>
      {totalSeconds > 0 && <span className={cx("drain", urgent && "urgent")} style={{ width: `${drain}%` }} />}
    </section>
  );
}
