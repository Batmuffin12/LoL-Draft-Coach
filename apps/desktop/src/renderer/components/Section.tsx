import type { ReactNode } from "react";
import { cx } from "../format";

export interface SectionProps {
  title?: string;
  /** At the right end of the rule: a chip, the screen's primary button, a key. */
  aside?: ReactNode;
  /** False for a sub-section that follows a main one ("Against your Ahri"). */
  gold?: boolean;
  className?: string;
  children?: ReactNode;
}

/** A flat block with an uppercase head and a hairline rule, the way the client heads its panels. Never inside a card. */
export function Section({ title, aside, gold = true, className, children }: SectionProps) {
  return (
    <section className={cx("section", className)}>
      {title && (
        <div className="section-head">
          <span className={cx("label", gold && "gold")}>{title}</span>
          <span className="rule" aria-hidden="true" />
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
