import type { PoolChampView, PoolCoverageView } from "../../shared/view";
import { cx, rate, t } from "../format";
import { ChampIcon } from "./ChampIcon";

const known = (c: PoolChampView) => c.tier === "main" || c.tier === "comfortable";

/**
 * Your pool against what a team needs: a column per champion (main and comfortable first,
 * learning and rusty dimmed, with their record when they have games), a row per need, a filled dot where the champion brings it.
 * A need nothing you know well brings is in amber; a champion without measured attributes shows "—".
 */
export function PoolCoverage({ pool, coverage }: { pool: PoolChampView[]; coverage: PoolCoverageView }) {
  return (
    <div className="mx" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${pool.length}, 72px)` }} role="table" aria-label="Which needs each champion in your pool covers">
      <span role="columnheader" />
      {pool.map((c) => (
        <span key={c.champion.id} className={cx("mx-head", !known(c) && "dim")} role="columnheader">
          <ChampIcon champ={c.champion} size={34} framed={c.tier === "main"} />
          <span className="t-heading">{c.champion.name}</span>
          {!known(c) && <span className="micro">{c.tierLabel.toLowerCase()}</span>}
          {/* Learning (or getting back into) a champion: its record so far, too. */}
          {(known(c) || c.games > 0) && <span className="micro">{`${c.games} · ${rate(c.winRate)}`}</span>}
        </span>
      ))}
      {coverage.needs.map((n) => [
        <span key={n.need} className={cx("mx-need", n.gap && "neg")} role="rowheader">
          {n.label}
        </span>,
        ...pool.map((c) => {
          const covers = coverage.covers[c.champion.id];
          return (
            <span key={`${n.need}-${c.champion.id}`} className={cx("mx-cell", !known(c) && "dim")} role="cell">
              {covers === undefined ? (
                <span className="muted" title="Not enough games to measure this champion">
                  —
                </span>
              ) : (
                <span className={covers.includes(n.need) ? "dot yes" : "dot no"} aria-label={covers.includes(n.need) ? `${c.champion.name} covers it` : `${c.champion.name} doesn't`} />
              )}
            </span>
          );
        }),
      ])}
    </div>
  );
}

/** Legend under the matrix. */
export function PoolLegend() {
  return <span className="micro">{t("pool.legend")}</span>;
}
