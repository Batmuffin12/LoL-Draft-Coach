import type { IconView } from "../../shared/view";
import { cx, rate, signedOrDash, tone } from "../format";
import { ChampIcon } from "./ChampIcon";

export interface MatrixOption {
  item: IconView & { reasons?: string[] };
  /** Pick share at the slot; null when unknown (the common path). */
  share: number | null;
  /** Win added; null with thin data. */
  winAdded: number | null;
}

export interface MatrixSlot {
  slot: number;
  minute: number | null;
  options: MatrixOption[];
}

const NTH = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

/** Items by slot as columns: the recommended one on top (gold ring), the next option under it, each with pick % and win added. */
export function ItemMatrix({ slots, rows = 2 }: { slots: MatrixSlot[]; rows?: number }) {
  const depth = Math.min(rows, Math.max(0, ...slots.map((s) => s.options.length)));
  const numbers = slots.some((s) => s.options.some((o) => o.share !== null));
  return (
    <div className="matrix" style={{ gridTemplateColumns: `repeat(${Math.max(slots.length, 3)}, minmax(0, 1fr))` }}>
      {slots.map((s) => (
        <span key={`h${s.slot}`} className="mh">
          <span className="label">{NTH[s.slot - 1] ?? `${s.slot}th`}</span>
          {s.minute !== null && <span className="m">{Math.round(s.minute)}m</span>}
        </span>
      ))}
      {Array.from({ length: Math.max(0, slots.length < 3 ? 3 - slots.length : 0) }, (_, i) => (
        <span key={`hx${i}`} />
      ))}
      {Array.from({ length: depth }, (_, r) => [
        ...slots.map((s) => {
          const o = s.options[r];
          if (!o) return <span key={`${s.slot}-${r}`} className="cell empty" />;
          const tip = [o.item.name, o.share === null ? null : `${rate(o.share)} of builds · ${signedOrDash(o.winAdded)} win added`, ...(o.item.reasons ?? [])].filter(Boolean).join("\n");
          return (
            <span key={`${s.slot}-${r}`} className={cx("cell", r === 0 && "top")} title={tip}>
              <ChampIcon champ={o.item} kind="game" size={r === 0 ? 36 : 24} lit={r === 0} title="" />
              <span className="nm">{o.item.name}</span>
              {numbers && (
                <span className="nums">
                  <b>{rate(o.share)}</b> <span className={tone(o.winAdded) === "neg" ? "neg" : o.winAdded === null ? "muted" : "pos"}>{signedOrDash(o.winAdded)}</span>
                </span>
              )}
            </span>
          );
        }),
        ...Array.from({ length: slots.length < 3 ? 3 - slots.length : 0 }, (_, i) => <span key={`x${r}-${i}`} />),
      ])}
    </div>
  );
}
