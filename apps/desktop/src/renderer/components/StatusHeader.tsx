import type { CoachStatus } from "@ldc/shared";
import logo from "../logo.svg";
import { t } from "../format";
import { Chip } from "./Chip";

export interface StatusHeaderProps {
  lcu: CoachStatus["lcu"];
  docked: boolean;
  /** The live meta's patch, e.g. "Patch 16.19". */
  metaText?: string | null;
  /** Games, age and offline state. */
  metaTitle?: string;
  onDock: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

const LCU_LABEL: Record<CoachStatus["lcu"], string> = {
  searching: "Waiting for League client",
  connected: "Connected",
  disconnected: "Client closed",
};

/** The 44px title bar and drag region: logo, connection dot, app name, live-meta chip, dock, minimize and close. */
export function StatusHeader({ lcu, docked, metaText, metaTitle, onDock, onMinimize, onClose }: StatusHeaderProps) {
  const label = LCU_LABEL[lcu];
  return (
    <header className="header">
      <img className="logo" src={logo} alt="" width={22} height={22} />
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
      <button className="icon-btn" onClick={onMinimize} title={t("window.minimize")} aria-label={t("window.minimize")}>
        –
      </button>
      <button className="icon-btn" onClick={onClose} title="Close">
        ×
      </button>
    </header>
  );
}
