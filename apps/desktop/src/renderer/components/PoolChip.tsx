import type { PoolChampView } from "../../shared/view";
import { cx, pct } from "../format";
import { ChampIcon } from "./ChampIcon";

/** A champion in your pool for a role: tier, games and win rate. */
export function PoolChip({ entry: c }: { entry: PoolChampView }) {
  const games = `${c.games} game${c.games === 1 ? "" : "s"}`;
  return (
    <div className={cx("pool", c.tier)} title={`${c.tierLabel}: ${games} in this role${c.winRate === null ? "" : `, ${pct(c.winRate)} win rate`}`}>
      <ChampIcon champ={c.champion} size={36} state={c.tier === "rusty" ? "hover" : "picked"} me={c.tier === "main"} />
      <span className="t">
        <span className="heading">{c.champion.name}</span>
        <span className="tier">
          {c.tierLabel} · {games}
        </span>
      </span>
      <span className="wr">{c.winRate === null ? "—" : pct(c.winRate)}</span>
    </div>
  );
}
