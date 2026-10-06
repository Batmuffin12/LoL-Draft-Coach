import { cx, pct, winTone } from "../format";

/** Predicted win chance: "54%" over "win chance", green above 50% and amber below. Nothing without a number from the engine. */
export function WinChance({ value, size = "row", showVs = true }: { value: number | null; size?: "hero" | "row"; showVs?: boolean }) {
  if (value === null) return null;
  return (
    <div className={cx("win", size)} title="Predicted win chance in this draft, from the live meta in your rank and your own games">
      <span className={cx("n", winTone(value))}>{pct(value)}</span>
      {showVs && <span className="vs muted">win chance</span>}
    </div>
  );
}
