import type { MonthView } from "../../shared/view";
import { cx } from "../format";

/** Style scores are percentiles in your role and rank: 50 is the rank's average. */
const RANK_AVERAGE = 50;

type Axis = MonthView["axes"][number];

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Your style axes before → now, one row each: a hollow dot for before, a filled one for now on a
 * 0–100 track with the rank average marked. The stretch between them is green when you went up and
 * amber when you went down, solid for a real change and faint when it may be noise.
 */
export function SlopeChart({ axes }: { axes: Axis[]; role: string }) {
  return (
    <div className="shifts">
      {axes.map((a) => {
        const from = a.from === null ? null : Math.round(a.from);
        const to = Math.round(a.to);
        const d = from === null ? null : to - from;
        const dir = d === null || d === 0 ? "flat" : d > 0 ? "pos" : "neg";
        const real = a.changed === "up" || a.changed === "down";
        const lo = from === null ? to : Math.min(from, to);
        const hi = from === null ? to : Math.max(from, to);
        const what = real ? "a real change" : a.changed === "steady" ? "no real change" : "too few games to tell";
        return (
          <div key={a.label} className={cx("shift", real && "real")} title={`${a.label}: ${from ?? "—"} before, ${to} now (${RANK_AVERAGE} = rank average): ${what}`}>
            <span className={cx("nm", real && dir)}>{a.label}</span>
            <span className="track" aria-hidden="true">
              <span className="avg" style={{ left: `${RANK_AVERAGE}%` }} />
              {from !== null && <span className={cx("gap", dir)} style={{ left: `${clamp(lo)}%`, width: `${clamp(hi) - clamp(lo)}%` }} />}
              {from !== null && <span className={cx("dot before", dir)} style={{ left: `${clamp(from)}%` }} />}
              <span className={cx("dot now", dir)} style={{ left: `${clamp(to)}%` }} />
            </span>
            <span className="val">
              <span className="muted">{from ?? "—"}</span>
              <span className="muted" aria-hidden="true">
                {" → "}
              </span>
              <b className="t-heading">{to}</b>
            </span>
            <span className={cx("chg", dir, !real && "faint")}>{d === null ? "" : signed(d)}</span>
          </div>
        );
      })}
    </div>
  );
}
