import type { IconView } from "../../shared/view";
import { cx, rate, signedPctOrDash } from "../format";
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


/**
 * Items by slot as columns: the recommended one on top (gold ring), the next option under it. One
 * number per cell (how often it's bought); a star marks the option that helps most in its slot
 * (its win added is on hover).
 */
export function ItemMatrix({ slots, rows = 2 }: { slots: MatrixSlot[]; rows?: number }) {
  const depth = Math.min(rows, Math.max(0, ...slots.map((s) => s.options.length)));
  const numbers = slots.some((s) => s.options.some((o) => o.share !== null));
  return (
    <div className="matrix" style={{ gridTemplateColumns: `repeat(${Math.max(slots.length, 3)}, minmax(0, 1fr))` }}>
      {slots.map((s) => (
        <span key={`h${s.slot}`} className="mh">
          <span className="label">{`Item ${s.slot}`}</span>
          {s.minute !== null && <span className="m">{Math.round(s.minute)} min</span>}
        </span>
      ))}
      {Array.from({ length: Math.max(0, slots.length < 3 ? 3 - slots.length : 0) }, (_, i) => (
        <span key={`hx${i}`} />
      ))}
      {Array.from({ length: depth }, (_, r) => [
        ...slots.map((s) => {
          const o = s.options[r];
          const best = Math.max(...s.options.slice(0, depth).map((x) => x.winAdded ?? -Infinity));
          if (!o)
            return (
              <span key={`${s.slot}-${r}`} className="cell empty">
                {r === 1 ? "No other common pick" : ""}
              </span>
            );
          const helpsMost = o.winAdded !== null && o.winAdded > 0 && o.winAdded === best;
          const tip = [
            o.item.name,
            o.share === null ? null : `Bought by ${rate(o.share)} of players`,
            o.winAdded === null ? null : `Players who bought it won ${signedPctOrDash(o.winAdded)} points vs what their game state predicted`,
            ...(o.item.reasons ?? []),
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <span key={`${s.slot}-${r}`} className={cx("cell", r === 0 && "top")} title={tip}>
              <ChampIcon champ={o.item} kind="game" size={r === 0 ? 32 : 22} lit={r === 0} title="" />
              <span className="nm">{o.item.name}</span>
              {numbers && (
                <span className="nums">
                  <b>{rate(o.share)}</b>
                  {helpsMost && <span className="pos" aria-label="helps most">{" ★"}</span>}
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
