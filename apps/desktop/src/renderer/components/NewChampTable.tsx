import type { NewChampView } from "../../shared/view";
import { cx, rate, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";

const EASE = { 1: "easy", 2: "medium", 3: "hard" } as const;

/** New champions for one role: the champion of yours it's most like, its win rate in your rank, ease; one reason under each. */
export function NewChampTable({ rows }: { rows: NewChampView[] }) {
  return (
    <div className="table newchamps" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-num" title="The champion you play that it's most like">
          Like
        </span>
        <span className="c-num" title="Its win rate in your rank and role">
          Win
        </span>
        <span className="c-num" title="Riot's difficulty rating">
          Ease
        </span>
      </div>
      {rows.map((c, i) => (
        <div key={c.champion.id} className="trow" role="row" title={c.reasons.join("\n")}>
          <span className="c-champ">
            <ChampIcon champ={c.champion} size={34} framed={i === 0} title="" />
            <span className="nm">{c.champion.name}</span>
            {c.owned === false && (
              <span className="tag" title="You don't own it yet">
                Not owned
              </span>
            )}
          </span>
          <span className="like">
            {c.like ? (
              <>
                <ChampIcon champ={c.like} size={20} title={`Plays like your ${c.like.name}`} />
                <span className="one-line">{c.like.name}</span>
              </>
            ) : (
              "—"
            )}
          </span>
          <span className={cx("c-num", winTone(c.winRate))} title={`${c.games.toLocaleString("en-US")} games`}>
            {rate(c.winRate, 1)}
          </span>
          <span className={cx("c-num ease", EASE[c.ease])}>{c.easeLabel}</span>
          {c.reasons[0] && <span className="sub">{c.reasons[0]}</span>}
        </div>
      ))}
    </div>
  );
}
