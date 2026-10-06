import type { Term } from "@ldc/shared";
import { count, cx, signed, TERM_LABEL } from "../format";

export interface DeltaBarProps {
  term: Term;
  /** Win-chance change that fills half the bar; the same everywhere so bars compare. */
  max?: number;
  /** Too few games behind it: drawn faint with a trailing dot. */
  thin?: boolean;
}

/** One part of a pick's win chance as a signed bar around zero: green right when it helps, amber left when it hurts. */
export function DeltaBar({ term, max = 0.05, thin }: DeltaBarProps) {
  const d = term.deltaWin;
  const width = Math.min(Math.abs(d) / max, 1) * 50;
  const label = TERM_LABEL[term.name] ?? term.name;
  const tip = `${label}: ${signed(d)} points${term.games ? ` (${count(term.games)} games)` : ""}`;
  return (
    <div className={cx("delta", d >= 0 ? "up" : "down", thin && "thin")} title={tip}>
      <span className="name">{label}</span>
      <span className="track" aria-hidden="true">
        <span className="zero" />
        <span className="fill" style={d >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
      </span>
      <span className={cx("val", d >= 0 ? "pos" : "neg")}>{signed(d)}</span>
    </div>
  );
}
