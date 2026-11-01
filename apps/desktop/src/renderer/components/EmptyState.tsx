import { cx } from "../format";
import { ProgressRow } from "./ProgressRow";

export interface EmptyStateProps {
  message: string;
  /** What to do, or what will show here. */
  hint?: string;
  /** How far along, when that's known. */
  progress?: { text: string; done: number; total: number } | null;
  /** With other content on the screen: no room to centre. */
  inline?: boolean;
}

/** A screen with nothing to show yet: one centred message, no heading over nothing. */
export function EmptyState({ message, hint, progress, inline }: EmptyStateProps) {
  return (
    <section className={cx("empty-state", inline && "inline")}>
      <p>{message}</p>
      {hint && <p className="caption">{hint}</p>}
      {progress && <ProgressRow {...progress} />}
    </section>
  );
}
