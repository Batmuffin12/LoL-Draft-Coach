import type { PoolChampView } from "../../shared/view";
import { cx, rate, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";

/**
 * Your pool for a role as a table: tier, games and win rate. Rusty champions (ones you know but
 * haven't played lately, or are getting back into) share one line, so the pool fits the panel.
 */
export function PoolTable({ rows }: { rows: PoolChampView[] }) {
  const rusty = rows.filter((c) => c.tier === "rusty");
  const listed = rows.filter((c) => c.tier !== "rusty");
  const detail = (c: PoolChampView) => (c.games > 0 ? `${c.champion.name}: ${c.games} recent games, ${rate(c.winRate)}` : `${c.champion.name}: no recent games`);
  return (
    <div className="table pool" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-num">Tier</span>
        <span className="c-num">Games</span>
        <span className="c-num">Win %</span>
      </div>
      {listed.map((c) => (
        <div key={c.champion.id} className={cx("trow", c.tier)} role="row">
          <span className="c-champ">
            <ChampIcon champ={c.champion} size={28} state="picked" framed={c.tier === "main"} />
            <span className="nm">{c.champion.name}</span>
          </span>
          <span className="c-num tier">{c.tierLabel}</span>
          <span className="c-num">{c.games}</span>
          <span className={cx("c-num big", winTone(c.winRate))}>{rate(c.winRate)}</span>
        </div>
      ))}
      {rusty.length > 0 && (
        <div className="open no-games" title={rusty.map(detail).join("\n")}>
          <span className="icons">
            {rusty.map((c) => (
              <ChampIcon key={c.champion.id} champ={c.champion} size={20} state="off" />
            ))}
          </span>
          <span className="one-line">{`${rusty[0]!.tierLabel}: ${rusty.map((c) => c.champion.name).join(", ")}`}</span>
        </div>
      )}
    </div>
  );
}
