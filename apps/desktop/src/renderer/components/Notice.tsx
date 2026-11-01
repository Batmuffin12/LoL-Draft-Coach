import type { ReactNode } from "react";
import { cx } from "../format";

/** One problem (or note) at the top of the scrolling area. Never a modal. With `onDismiss`, it has a close button. */
export function Notice({ tone = "warn", children, onDismiss, dismissLabel }: { tone?: "warn" | "info"; children: ReactNode; onDismiss?: () => void; dismissLabel?: string }) {
  return (
    <div className={cx("notice", tone === "info" && "info")} role="status">
      <span className="g" aria-hidden="true">
        {tone === "info" ? "i" : "!"}
      </span>
      <span className="body">{children}</span>
      {onDismiss && (
        <button type="button" className="dismiss" onClick={onDismiss} title={dismissLabel} aria-label={dismissLabel}>
          ×
        </button>
      )}
    </div>
  );
}
