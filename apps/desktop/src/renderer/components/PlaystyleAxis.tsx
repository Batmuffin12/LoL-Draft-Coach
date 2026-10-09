import { useState } from "react";
import type { AxisView } from "../../shared/view";
import { cx } from "../format";

/** One playstyle axis as a bar around typical (50) for players in that role; a click lists every metric behind it. */
export function PlaystyleAxis({ axis: a, showDetail }: { axis: AxisView; showDetail?: boolean }) {
  const [open, setOpen] = useState(false);
  const left = Math.min(a.score, 50);
  const width = Math.abs(a.score - 50);
  return (
    <>
      <button
        type="button"
        className={cx("axis", a.level, open && "open")}
        title={`${a.label}: ${a.score} (${a.levelLabel}), ${a.games} games. Click for the numbers behind it.`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{a.label}</span>
        <span className="track" aria-hidden="true">
          <span className="mid" />
          <span className="fill" style={{ left: `${left}%`, width: `${width}%` }} />
        </span>
        <span className="val">{a.score}</span>
      </button>
      {open ? (
        <ul className="axis-metrics">
          {a.metrics.map((m) => (
            <li key={m} title={m}>
              {m}
            </li>
          ))}
        </ul>
      ) : (
        showDetail && a.detail && <span className="axis-detail">{a.detail}</span>
      )}
    </>
  );
}
