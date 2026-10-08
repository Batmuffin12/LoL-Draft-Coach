import type { FocusView } from "../../shared/view";
import { cx } from "../format";

/**
 * One goal on your main champion and role, said plainly: "Fewer deaths to champions",
 * now → goal (with the typical value beside it), your last games against the goal, and why.
 */
export function FocusCard({ focus: f }: { focus: FocusView }) {
  const hit = f.recent.filter(Boolean).length;
  return (
    <div className="focus">
      <div className="f-head">
        <span className="f-name">{f.title}</span>
        <span className="micro">{f.on}</span>
      </div>
      <div className="f-goal">
        <span className="f-now" title={`Your average over your last ${f.checkGames} games`}>
          <span className="label">Now</span>
          <b>{f.youText}</b>
        </span>
        <span className="f-arrow" aria-hidden="true">
          →
        </span>
        <span className="f-target" title={f.goalHint}>
          <span className="label gold">Goal</span>
          <b>{f.goalText}</b>
        </span>
        <span className="f-avg" title="The middle value for players in your role">
          {f.typicalLine}
        </span>
      </div>
      <div className="games" title="Filled: you reached the goal in that game">
        <span className="label">{`Last ${f.recent.length} games`}</span>
        {f.recent.map((ok, i) => (
          <span key={i} className={cx("g", ok ? "met" : "miss")} />
        ))}
        <span className="stat">
          <b>{hit}</b>
          {` hit the goal`}
        </span>
      </div>
      {f.tips.length > 0 && (
        <div className="f-tips">
          <span className="label">Keep in mind</span>
          <ul className="notes">
            {f.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <span className="micro">{f.why}</span>
    </div>
  );
}
