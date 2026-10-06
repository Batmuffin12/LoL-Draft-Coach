import { useEffect, useState } from "react";
import type { PickView } from "../../shared/view";
import { cx, pct, pickColumns, pickReasons, signedPctOrDash, tone, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";
import { OffMetaChip } from "./Chip";

export interface PickTableProps {
  picks: PickView[];
  /** "Picked over your usual X because …": under row 1's reasons, in gold. */
  whyNot: string | null;
}

const COLS = [
  { key: "lane", label: "Matchup", title: "Into their laner and the rest of their team" },
  { key: "you", label: "You", title: "Your own games on it" },
  { key: "team", label: "Team", title: "What your team needs, and duos with your allies" },
] as const;

/** Suggested picks as one table with fixed columns; the selected row's reasons under it. Row 1 is selected first. */
export function PickTable({ picks, whyNot }: PickTableProps) {
  const [sel, setSel] = useState(0);
  const first = picks[0]?.champion.id;
  // A new #1 (the draft moved on) is selected again.
  useEffect(() => setSel(0), [first]);
  const cur = picks[sel] ?? picks[0];
  const at = cur ? picks.indexOf(cur) : -1;
  return (
    <div className="table picks" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-win" title="Predicted win chance in this draft">
          Win %
        </span>
        {COLS.map((c) => (
          <span key={c.key} className="c-num" title={c.title}>
            {c.label}
          </span>
        ))}
      </div>
      {picks.map((p, i) => {
        const cols = pickColumns(p.terms);
        const tip = cols.meta === null ? p.champion.name : `${p.champion.name}\nStrength in your rank: ${signedPctOrDash(cols.meta)}`;
        return (
          <button key={p.champion.id} type="button" className={cx("trow", i === at && "sel")} onClick={() => setSel(i)} aria-pressed={i === at}>
            <span className="c-champ" title={tip}>
              <ChampIcon champ={p.champion} size={34} framed={i === 0} title="" />
              <span className="nm">{p.champion.name}</span>
              {p.offMeta && <OffMetaChip />}
            </span>
            <span className={cx("c-win", winTone(p.expectedWin))}>{p.expectedWin === null ? "—" : pct(p.expectedWin)}</span>
            {COLS.map((c) => (
              <span key={c.key} className={cx("c-num", tone(cols[c.key]))}>
                {signedPctOrDash(cols[c.key])}
              </span>
            ))}
          </button>
        );
      })}
      <div className="legend">Win % in this draft. Matchup, You and Team: what each adds to it or takes away.</div>
      {cur && (
        <div className="detail">
          <ul className="reasons">
            {pickReasons(cur.reasons, 5).map((r) => (
              <li key={r.text} className={r.negative ? "but" : undefined}>
                {r.text}
              </li>
            ))}
            {at === 0 && whyNot && <li className="why">{whyNot}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
