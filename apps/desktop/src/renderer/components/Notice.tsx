import type { ReactNode } from "react";
import { cx } from "../format";

/** One problem (or note) at the top of the scrolling area. Never a modal. */
export function Notice({ tone = "warn", children }: { tone?: "warn" | "info"; children: ReactNode }) {
  return (
    <div className={cx("notice", tone === "info" && "info")} role="status">
      <span className="g" aria-hidden="true">
        {tone === "info" ? "i" : "!"}
      </span>
      <span>{children}</span>
    </div>
  );
}
