import type { AxisView } from "../../shared/view";
import { cx } from "../format";

/** One playstyle axis as a bar around typical (50) for players in that role. */
export function PlaystyleAxis({ axis: a, showDetail }: { axis: AxisView; showDetail?: boolean }) {
  const left = Math.min(a.score, 50);
  const width = Math.abs(a.score - 50);
  return (
    <>
      <div className={cx("axis", a.level)} title={`${a.label}: ${a.score} (${a.levelLabel}), ${a.games} games`}>
        <span>{a.label}</span>
        <span className="track" aria-hidden="true">
          <span className="mid" />
          <span className="fill" style={{ left: `${left}%`, width: `${width}%` }} />
        </span>
        <span className="val">{a.score}</span>
      </div>
      {showDetail && a.detail && <span className="axis-detail">{a.detail}</span>}
    </>
  );
}
