import type { BanView } from "../../shared/view";
import { points, rate, t, tip, winsPer100 } from "../format";
import { ChampIcon } from "./ChampIcon";

export interface BanRow extends BanView {
  /** A ban that protects the champion you're hovering. */
  forHover?: boolean;
}

/** Suggested bans as a table: what each costs you and its win rate; one reason under each name (pick and ban rates on hover). */
export function BanTable({ bans }: { bans: BanRow[] }) {
  // Hurts as a bar against the biggest threat in the list: the points are often too small to read at one decimal.
  const worst = Math.max(...bans.map((b) => -b.threat), 1e-9);
  return (
    <div className="table bans" role="table">
      <div className="thead" role="row">
        <span className="c-champ" role="columnheader">{t("label.champion")}</span>
        <span className="c-num" role="columnheader" title={t("ban.threatTip")}>
          {t("ban.threat")}
        </span>
        <span className="c-num" role="columnheader" title={t("ban.winRateTip")}>
          {t("label.winRate")}
        </span>
      </div>
      {bans.map((b, i) => (
        <div key={b.champion.id} className="trow" role="row" {...tip([...b.reasons, t("ban.rates", { pick: rate(b.pickRate), ban: rate(b.banRate) })].join("\n"))}>
          <span className="c-champ" role="cell">
            <ChampIcon champ={b.champion} size={34} framed={i === 0} title="" />
            <span className="nm">{b.champion.name}</span>
          </span>
          <span className="c-bar" role="cell" title={t("ban.cost", { points: points(b.threat), wins: winsPer100(b.threat) })} aria-label={t("ban.cost", { points: points(b.threat), wins: winsPer100(b.threat) })}>
            <span className="fill" style={{ width: `${Math.max(6, Math.round((-b.threat / worst) * 100))}%` }} />
          </span>
          <span className="c-num" role="cell">
            {rate(b.winRate, 1)}
          </span>
          {(b.reasons[0] || b.forHover) && (
            <span className="sub" role="cell">
              {b.forHover && <b>{t("ban.forHover")} </b>}
              {b.reasons[0]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
