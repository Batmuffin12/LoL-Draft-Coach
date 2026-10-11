import type { ReactNode } from "react";
import { cx } from "../format";

export interface WindowProps {
  header: ReactNode;
  /** Fixed under the header: the phase band, the locked-in strip or tabs. */
  band?: ReactNode;
  /** One-line footer: the suggestion disclaimer, the build's source, or the account and Riot notice. */
  footer?: ReactNode;
  /** The scrolling area of flat sections. */
  children?: ReactNode;
  /** "lobby": the lobby's roomier section padding. */
  variant?: "lobby";
}

/** The docked window: 440 × 720 at a 720px client (the main process zooms it), framed like the client's edge. */
export function Window({ header, band, footer, children, variant }: WindowProps) {
  return (
    <div className={cx("window", variant)}>
      {header}
      {band}
      <div className="scroll">{children}</div>
      {footer && <div className="foot">{footer}</div>}
    </div>
  );
}
