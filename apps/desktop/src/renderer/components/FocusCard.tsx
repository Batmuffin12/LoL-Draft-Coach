import type { FocusView } from "../../shared/view";
import { cx } from "../format";

/**
 * One measurable focus on your main champion and role: you, the target and typical as numbers
 * and on one scale (the gap to close in gold), your last games against the target, and why.
 */
export function FocusCard({ focus: f }: { focus: FocusView }) {
  const lo = Math.min(f.you, f.target, f.typical);
  const hi = Math.max(f.you, f.target, f.typical);
  const pad = (hi - lo) * 0.25 || 1;
  const at = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const met = f.recent.filter(Boolean).length;
  return (
    <div className="focus">
      <div className="f-head">
        <span className="f-name">{f.label}</span>
        <span className="micro">{f.on}</span>
      </div>
      <div className="f-nums">
        <span title={`Your average over your last ${f.checkGames} games`}>
          <span className="label">You</span>
          <span className="v">{f.youText}</span>
        </span>
        <span className="target" title="A step toward typical, reachable in a few games">
          <span className="label gold">Target</span>
          <span className="v">{f.targetText}</span>
        </span>
        <span title="The middle value for players in your role">
          <span className="label">Typical</span>
          <span className="v">{f.typicalText}</span>
        </span>
      </div>
      <div className="scale" aria-hidden="true">
        <span className="bar" />
        <span className="gain" style={{ left: `${Math.min(at(f.you), at(f.target))}%`, width: `${Math.abs(at(f.target) - at(f.you))}%` }} />
        <span className="pin typical" style={{ left: `${at(f.typical)}%` }} />
        <span className="pin target" style={{ left: `${at(f.target)}%` }} />
        <span className="pin mine" style={{ left: `${at(f.you)}%` }} />
      </div>
      <div className="games" title="Your last games: filled when you reached the target">
        <span className="label">{`Last ${f.recent.length}`}</span>
        {f.recent.map((ok, i) => (
          <span key={i} className={cx("g", ok ? "met" : "miss")} />
        ))}
        <span className="stat">
          <b>{met}</b>
          {` of ${f.recent.length} at target`}
        </span>
      </div>
      <span className="micro">{f.why}</span>
    </div>
  );
}
