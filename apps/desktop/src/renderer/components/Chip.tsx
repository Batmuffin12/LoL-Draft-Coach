import type { ReactNode } from "react";
import type { PickAdviceView } from "../../shared/view";
import { cx } from "../format";

export interface ChipProps {
  tone?: "clear" | "close" | "thin" | "warn" | "pos" | "neg";
  dot?: boolean;
  title?: string;
  children: ReactNode;
}

export function Chip({ tone, dot, title, children }: ChipProps) {
  return (
    <span className={cx("chip", tone)} title={title}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

/** How sure the top pick is: a clear gap, a close call, or thin data. */
export function ConfidenceChip({ confidence }: { confidence: PickAdviceView["confidence"] }) {
  if (!confidence) return null;
  return (
    <Chip tone={confidence.level} dot={confidence.level !== "thin"}>
      {confidence.label}
    </Chip>
  );
}

export function OffMetaChip() {
  return (
    <Chip tone="warn" title="You play it in this role, but it isn't a usual role for this champion">
      off-meta
    </Chip>
  );
}
