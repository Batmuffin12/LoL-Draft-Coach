import type { MatchupRowView } from "../../shared/view";
import { cx, games, positionLabel, rate, signedPctOrDash, tone, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";

/**
 * Your champion against (or with) each champion in the draft. Champions with games for the pair
 * get a row (your lane first); the ones without, and seats not picked yet, are one line each.
 */
export function MatchupTable({ rows, title }: { rows: MatchupRowView[]; title: string }) {
  const picked = rows.filter((r) => r.champion);
  const open = rows.filter((r) => !r.champion);
  // Your lane opponent keeps its row even without games; other pairs without games are listed by name.
  const shown = picked.filter((r) => r.games || r.lane);
  const noGames = picked.filter((r) => !r.games && !r.lane);
  return (
    <div className="table matchups" role="table">
      <div className="thead" role="row">
        <span className="c-champ">{title}</span>
        <span className="c-num" title="Your champion's win rate in games with this pair">
          Win %
        </span>
        <span className="c-num" title="Better or worse than both champions' usual win rates predict">
          Vs avg
        </span>
        <span className="c-num">Games</span>
      </div>
      {shown.map((m) => (
        <div key={m.champion!.id} className={cx("trow", m.lane && "sel")} role="row">
          <span className="c-champ">
            <ChampIcon champ={m.champion} size={28} framed={m.lane} />
            <span className="nm col">
              <span className="one-line">{m.champion!.name}</span>
              <span className="why">{`${positionLabel(m.role)}${m.lane ? " · your lane" : ""}`}</span>
            </span>
          </span>
          <span className={cx("c-num big", winTone(m.winRate))}>{m.games ? rate(m.winRate, 1) : "—"}</span>
          <span className={cx("c-num", tone(m.delta))}>{m.games ? signedPctOrDash(m.delta) : "—"}</span>
          <span className="c-num muted">{m.games ? games(m.games) : "—"}</span>
        </div>
      ))}
      {noGames.length > 0 && (
        <div className="open no-games">
          <span className="icons">
            {noGames.map((m) => (
              <ChampIcon key={m.champion!.id} champ={m.champion} size={20} />
            ))}
          </span>
          <span className="one-line" title={noGames.map((m) => m.champion!.name).join(", ")}>No games yet with these</span>
        </div>
      )}
      {open.length > 0 && <div className="open">{`${open.map((m) => positionLabel(m.role)).join(", ")}: not picked yet`}</div>}
    </div>
  );
}
