import type { MonthView } from "../../shared/view";
import { cx, t, tip } from "../format";

type Axis = MonthView["axes"][number];

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const change = (a: Axis) => (a.from === null ? 0 : Math.round(a.to) - Math.round(a.from));
const numbers = (a: Axis) => `${a.label} ${a.from === null ? "—" : Math.round(a.from)} → ${Math.round(a.to)}`;

/** Your style axes sorted out: real changes, biggest first; those about the same; those with too few games to tell. */
export function sortShifts(axes: Axis[]): { real: Axis[]; steady: Axis[]; unknown: Axis[] } {
  const isReal = (a: Axis) => a.changed === "up" || a.changed === "down";
  return {
    real: axes.filter(isReal).sort((a, b) => Math.abs(change(b)) - Math.abs(change(a))),
    steady: axes.filter((a) => a.changed === "steady"),
    unknown: axes.filter((a) => a.changed === null),
  };
}

function Rest({ axes, label }: { axes: Axis[]; label: string }) {
  if (!axes.length) return null;
  return (
    <span className="micro" {...tip(axes.map(numbers).join("\n"))}>
      {t(label, { n: axes.length })}
    </span>
  );
}

/** What moved in your style, as plain rows ("Vision 56 → 50 −6"). The rest is one line, its numbers on hover. */
export function StyleShifts({ axes }: { axes: Axis[] }) {
  const { real, steady, unknown } = sortShifts(axes);
  return (
    <div className="shifts">
      {real.map((a) => {
        const d = change(a);
        return (
          <div key={a.label} className="shift">
            <span className="nm">{a.label}</span>
            <span className="val">
              <span className="muted">{`${Math.round(a.from ?? a.to)} → `}</span>
              <b>{Math.round(a.to)}</b>
            </span>
            <span className={cx("chg", d > 0 ? "pos" : d < 0 ? "neg" : "muted")}>{signed(d)}</span>
          </div>
        );
      })}
      <Rest axes={steady} label={real.length ? "month.others" : "month.allSteady"} />
      <Rest axes={unknown} label="month.othersUnknown" />
    </div>
  );
}
