import type { PoolChampView } from "../../shared/view";
import { cx, rate, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Your pool for a role as a table: tier, games and win rate. Rusty champions without recent games share one line. */
export function PoolTable({ rows }: { rows: PoolChampView[] }) {
  const idle = rows.filter((c) => c.tier === "rusty" && c.games === 0);
  const listed = rows.filter((c) => !idle.includes(c));
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
            <ChampIcon champ={c.champion} size={34} state={c.tier === "rusty" ? "off" : "picked"} framed={c.tier === "main"} />
            <span className="nm">{c.champion.name}</span>
          </span>
          <span className="c-num tier">{c.tierLabel}</span>
          <span className="c-num">{c.games}</span>
          <span className={cx("c-num big", winTone(c.winRate))}>{rate(c.winRate)}</span>
        </div>
      ))}
      {idle.length > 0 && (
        <div className="open no-games">
          <span className="icons">
            {idle.map((c) => (
              <ChampIcon key={c.champion.id} champ={c.champion} size={20} state="off" />
            ))}
          </span>
          <span className="one-line" title={idle.map((c) => c.champion.name).join(", ")}>{`${idle[0]!.tierLabel}: no recent games`}</span>
        </div>
      )}
    </div>
  );
}
