import type { AxisView } from "../../shared/view";

/** Radius of the 100 ring, and room around it for the labels (the viewBox is centred on 0,0). */
const R = 76;
const HALF_WIDTH = 203;
const TOP = R + 22;
const BOTTOM = R + 20;
const LABEL_GAP = 10;

const point = (i: number, n: number, r: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, cos: Math.cos(a), sin: Math.sin(a) };
};
const polygon = (n: number, r: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const p = point(i, n, r(i));
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");

const levelClass = (level: AxisView["level"]) => (level === "high" ? "pos" : level === "low" ? "neg" : "text");

/**
 * Your style on one spoke per axis (config order): your scores as a gold shape, the rank
 * average (50) dashed. Each label names the axis and your score; its tooltip lists the metrics
 * behind it, and a list under the chart says the same for screen readers.
 */
export function StyleRadar({ axes, role }: { axes: AxisView[]; role: string }) {
  const n = axes.length;
  if (n < 3) return null;
  return (
    <>
      <svg className="radar" viewBox={`${-HALF_WIDTH} ${-TOP} ${HALF_WIDTH * 2} ${TOP + BOTTOM}`} width="100%" role="img" aria-label={`Your ${role} style against the rank average on ${n} axes`}>
        <polygon className="ring" points={polygon(n, () => R)} />
        {axes.map((a, i) => {
          const p = point(i, n, R);
          return <line key={a.axis} className="spoke" x1={0} y1={0} x2={p.x} y2={p.y} />;
        })}
        <polygon className="avg" points={polygon(n, () => R / 2)} />
        <polygon className="me" points={polygon(n, (i) => (Math.max(0, Math.min(100, axes[i]!.score)) / 100) * R)} />
        {axes.map((a, i) => {
          const p = point(i, n, R + LABEL_GAP);
          const anchor = p.cos > 0.2 ? "start" : p.cos < -0.2 ? "end" : "middle";
          const dy = p.sin < -0.5 ? -2 : p.sin > 0.5 ? 12 : 4;
          return (
            <text key={a.axis} className="lbl" x={p.x} y={p.y + dy} textAnchor={anchor}>
              <title>{[`${a.label}: ${a.score} (${a.levelLabel})`, ...a.metrics].join("\n")}</title>
              {a.label} <tspan className={levelClass(a.level)}>{a.score}</tspan>
            </text>
          );
        })}
      </svg>
      <ul className="sr-only">
        {axes.map((a) => (
          <li key={a.axis}>{[`${a.label}: ${a.score}, ${a.levelLabel}`, ...a.metrics].join(". ")}</li>
        ))}
      </ul>
    </>
  );
}
