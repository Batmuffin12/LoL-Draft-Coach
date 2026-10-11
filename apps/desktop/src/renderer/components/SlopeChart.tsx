import type { MonthView } from "../../shared/view";
import { cx } from "../format";

const W = 406;
const H = 154;
const X_BEFORE = 110;
const X_NOW = 250;
const TOP = 22;
const BOTTOM = H - 8;
/** The score scale at least spans this (rank average 50 in the middle); wider when the data is. */
const SCALE_LO = 30;
const SCALE_HI = 75;
/** Labels closer than this are nudged apart. */
const MIN_GAP = 14;

type Axis = MonthView["axes"][number];

/** Spreads label positions so no two are closer than MIN_GAP, staying inside the chart. */
function spread(ys: number[]): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k]!.y = Math.max(order[k]!.y, order[k - 1]!.y + MIN_GAP);
  const over = (order.at(-1)?.y ?? 0) - BOTTOM;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k]!.y = Math.min(order[k]!.y, order[k + 1]!.y - MIN_GAP);
  const out = [...ys];
  for (const o of order) out[o.i] = o.y;
  return out;
}

const tone = (a: Axis) => (a.changed === "up" ? "pos" : a.changed === "down" ? "neg" : "flat");
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/**
 * Your style axes last period against this one: a line per axis from BEFORE to NOW, coloured
 * when it really changed (up green, down amber) and grey when it didn't. Changed lines are
 * labelled on both sides, the rest only on the right.
 */
export function SlopeChart({ axes, role }: { axes: Axis[]; role: string }) {
  const scores = axes.flatMap((a) => (a.from === null ? [a.to] : [a.from, a.to]));
  const lo = Math.min(SCALE_LO, ...scores);
  const hi = Math.max(SCALE_HI, ...scores);
  const y = (s: number) => TOP + ((hi - s) * (BOTTOM - TOP)) / Math.max(1, hi - lo);
  const changed = (a: Axis) => a.from !== null && (a.changed === "up" || a.changed === "down");
  const right = spread(axes.map((a) => y(a.to)));
  const leftIdx = axes.map((a, i) => (changed(a) ? i : -1)).filter((i) => i >= 0);
  const leftY = spread(leftIdx.map((i) => y(axes[i]!.from!)));
  return (
    <svg className="slope" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Your ${role} style scores last period and this period: ${axes.map((a) => `${a.label} ${a.from === null ? "" : `${Math.round(a.from)} to `}${Math.round(a.to)}`).join(", ")}`}>
      <text className="col" x={X_BEFORE} y={10} textAnchor="middle">
        BEFORE
      </text>
      <text className="col" x={X_NOW} y={10} textAnchor="middle">
        NOW
      </text>
      <line className="axis" x1={X_BEFORE} y1={TOP - 8} x2={X_BEFORE} y2={BOTTOM + 2} />
      <line className="axis" x1={X_NOW} y1={TOP - 8} x2={X_NOW} y2={BOTTOM + 2} />
      {/* Grey lines first, so the changed ones draw on top. */}
      {[...axes]
        .sort((a, b) => Number(changed(a)) - Number(changed(b)))
        .map((a) =>
          a.from === null ? null : (
            <g key={a.label} className={cx("ln", tone(a), changed(a) && "changed")}>
              <line x1={X_BEFORE} y1={y(a.from)} x2={X_NOW} y2={y(a.to)} />
              {changed(a) && (
                <>
                  <circle cx={X_BEFORE} cy={y(a.from)} r={3.5} />
                  <circle cx={X_NOW} cy={y(a.to)} r={4} />
                </>
              )}
            </g>
          ),
        )}
      {leftIdx.map((i, k) => (
        <text key={`l${i}`} className="lbl flat" x={X_BEFORE - 10} y={leftY[k]! + 4} textAnchor="end">
          {`${axes[i]!.label} ${Math.round(axes[i]!.from!)}`}
        </text>
      ))}
      {axes.map((a, i) => (
        <text key={`r${a.label}`} className={cx("lbl", changed(a) ? tone(a) : "flat")} x={X_NOW + 10} y={right[i]! + 4}>
          {`${Math.round(a.to)} ${a.label}${changed(a) ? ` ${signed(Math.round(a.to) - Math.round(a.from!))}` : ""}`}
        </text>
      ))}
    </svg>
  );
}
