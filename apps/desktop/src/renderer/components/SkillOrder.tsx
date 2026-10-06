import { Fragment } from "react";

/** Skill keys as keycaps: the first three levels, then the max order. */
export function SkillOrder({ first, order }: { first: string[]; order: string[] }) {
  return (
    <div className="skills">
      <div className="keys">
        <span className="label k">Start</span>
        {first.map((k, i) => (
          <span key={i} className="key">
            {k}
          </span>
        ))}
      </div>
      <div className="keys">
        <span className="label k">Max</span>
        {order.map((k, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="sep">›</span>}
            <span className="key max">{k}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
