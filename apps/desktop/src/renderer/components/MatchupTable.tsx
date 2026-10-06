import type { MatchupRowView } from "../../shared/view";
import { cx, games, positionLabel, rate, signedOrDash, tone, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Your champion against (or with) each champion in the draft; seats that haven't picked collapse into one line. */
export function MatchupTable({ rows, title }: { rows: MatchupRowView[]; title: string }) {
  const picked = rows.filter((r) => r.champion);
  const open = rows.filter((r) => !r.champion);
  return (
    <div className="table matchups" role="table">
      <div className="thead" role="row">
        <span className="c-champ">{title}</span>
        <span className="c-num" title="Your win rate in games with this pair">
          Win
        </span>
        <span className="c-num" title="Versus what you'd expect from both champions' strength, points of win chance">
          Edge
        </span>
        <span className="c-num">Games</span>
      </div>
      {picked.map((m) => (
        <div key={m.champion!.id} className={cx("trow", m.lane && "sel")} role="row">
          <span className="c-champ">
            <ChampIcon champ={m.champion} size={34} framed={m.lane} />
            <span className="nm col">
              <span className="one-line">{m.champion!.name}</span>
              <span className="why">{`${positionLabel(m.role)}${m.lane ? " · your lane" : ""}`}</span>
            </span>
          </span>
          <span className={cx("c-num big", winTone(m.winRate))}>{rate(m.winRate, 1)}</span>
          <span className={cx("c-num", tone(m.delta))}>{signedOrDash(m.delta)}</span>
          <span className="c-num muted">{m.games ? games(m.games) : "—"}</span>
        </div>
      ))}
      {open.length > 0 && <div className="open">{`${open.map((m) => positionLabel(m.role)).join(", ")}: not picked yet`}</div>}
    </div>
  );
}
