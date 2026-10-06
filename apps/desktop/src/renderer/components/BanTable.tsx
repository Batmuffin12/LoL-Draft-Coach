import type { BanView } from "../../shared/view";
import { cx, rate, signed, tone } from "../format";
import { ChampIcon } from "./ChampIcon";

export interface BanRow extends BanView {
  /** A ban that protects the champion you're hovering. */
  forHover?: boolean;
}

/** Suggested bans as a table: what each costs you and how common it is; one reason under each name. */
export function BanTable({ bans }: { bans: BanRow[] }) {
  return (
    <div className="table bans" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-num" title="Win chance it costs you, weighted by how often it's picked">
          Hurts
        </span>
        <span className="c-num" title="Its win rate in your rank">
          Win
        </span>
        <span className="c-num" title="How often it's picked in your rank">
          Pick
        </span>
        <span className="c-num" title="How often it's banned in your rank">
          Ban
        </span>
      </div>
      {bans.map((b, i) => (
        <div key={b.champion.id} className={cx("trow", i === 0 && "sel")} role="row" title={b.reasons.join("\n")}>
          <span className="c-champ">
            <ChampIcon champ={b.champion} size={34} framed={i === 0} title="" />
            <span className="nm">{b.champion.name}</span>
          </span>
          <span className={cx("c-num", tone(b.threat))}>{signed(b.threat)}</span>
          <span className="c-num">{rate(b.winRate, 1)}</span>
          <span className="c-num muted">{rate(b.pickRate)}</span>
          <span className="c-num muted">{rate(b.banRate)}</span>
          {(b.reasons[0] || b.forHover) && (
            <span className="sub">
              {b.forHover && <b>Vs your hover. </b>}
              {b.reasons[0]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
