import type { PoolChampView } from "../../shared/view";
import { cx, rate, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Your pool for a role as a table: tier, games and win rate. */
export function PoolTable({ rows }: { rows: PoolChampView[] }) {
  return (
    <div className="table pool" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-num">Tier</span>
        <span className="c-num">Games</span>
        <span className="c-num">Win %</span>
      </div>
      {rows.map((c) => (
        <div key={c.champion.id} className={cx("trow", c.tier)} role="row">
          <span className="c-champ">
            <ChampIcon champ={c.champion} size={34} state={c.tier === "rusty" ? "off" : "picked"} framed={c.tier === "main"} />
            <span className="nm">{c.champion.name}</span>
          </span>
          <span className="c-num tier">{c.tierLabel}</span>
          <span className="c-num">{c.games}</span>
          <span className={cx("c-num big", winTone(c.winRate))}>{rate(c.winRate)}</span>
        </div>
      ))}
    </div>
  );
}
