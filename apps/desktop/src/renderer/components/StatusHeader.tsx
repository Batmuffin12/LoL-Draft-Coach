import type { CoachStatus } from "@ldc/shared";
import { Chip } from "./Chip";

export interface StatusHeaderProps {
  lcu: CoachStatus["lcu"];
  docked: boolean;
  /** Patch and age of the live meta, e.g. "16.19 · 12 min". */
  metaText?: string | null;
  /** Band, game count and offline state. */
  metaTitle?: string;
  onDock: () => void;
  onClose: () => void;
}

const LCU_LABEL: Record<CoachStatus["lcu"], string> = {
  searching: "Waiting for League client",
  connected: "Connected",
  disconnected: "Client closed",
};

/** The 44px title bar and drag region: connection dot, app name, live-meta chip, dock and close. */
export function StatusHeader({ lcu, docked, metaText, metaTitle, onDock, onClose }: StatusHeaderProps) {
  const label = LCU_LABEL[lcu];
  return (
    <header className="header">
      <span className={`status-dot ${lcu}`} title={label} role="img" aria-label={label} />
      <span className="app">Draft Coach</span>
      {metaText && <Chip title={metaTitle}>{metaText}</Chip>}
      <span className="spacer" />
      <button
        className="icon-btn"
        onClick={onDock}
        title={docked ? "Docked to the client. Click to undock" : "Undocked. Click to dock beside the client"}
        aria-pressed={docked}
      >
        {docked ? "◧" : "□"}
      </button>
      <button className="icon-btn" onClick={onClose} title="Close">
        ×
      </button>
    </header>
  );
}
