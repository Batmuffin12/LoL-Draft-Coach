import type { ReactNode } from "react";

export interface WindowProps {
  header: ReactNode;
  /** Fixed under the header: the phase band, the locked-in strip or tabs. */
  band?: ReactNode;
  /** One-line footer: the suggestion disclaimer, the build's source, or the account and Riot notice. */
  footer?: ReactNode;
  /** The scrolling area of flat sections. */
  children?: ReactNode;
}

/** The docked window: 440 × 720 at a 720px client (the main process zooms it), framed like the client's edge. */
export function Window({ header, band, footer, children }: WindowProps) {
  return (
    <div className="window">
      {header}
      {band}
      <div className="scroll">{children}</div>
      {footer && <div className="foot">{footer}</div>}
    </div>
  );
}
