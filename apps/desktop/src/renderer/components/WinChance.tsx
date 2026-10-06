import { cx, pct, signed } from "../format";

/** Predicted win chance with its reference: "54%" and "+4.0 vs even". Nothing without a number from the engine. */
export function WinChance({ value, size = "row", showVs = true }: { value: number | null; size?: "hero" | "row"; showVs?: boolean }) {
  if (value === null) return null;
  const diff = value - 0.5;
  return (
    <div className={cx("win", size)} title="Predicted win chance in this draft, from the live meta in your rank and your own games">
      <span className="n">{pct(value)}</span>
      {showVs && <span className={cx("vs", diff >= 0 ? "pos" : "neg")}>{signed(diff)} vs even</span>}
    </div>
  );
}
