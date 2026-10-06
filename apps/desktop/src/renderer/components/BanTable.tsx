import type { BanView } from "../../shared/view";
import { rate, signedPct } from "../format";
import { ChampIcon } from "./ChampIcon";

export interface BanRow extends BanView {
  /** A ban that protects the champion you're hovering. */
  forHover?: boolean;
}

/** Suggested bans as a table: what each costs you and how common it is; one reason under each name. */
export function BanTable({ bans }: { bans: BanRow[] }) {
  // Hurts as a bar against the biggest threat in the list: the points are often too small to read at one decimal.
  const worst = Math.max(...bans.map((b) => -b.threat), 1e-9);
  return (
    <div className="table bans" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-num" title="How much win chance it costs you, weighted by how often it's picked">
          Threat
        </span>
        <span className="c-num" title="Its win rate in your rank">
          Win %
        </span>
        <span className="c-num" title="How often it's picked in your rank">
          Pick %
        </span>
        <span className="c-num" title="How often it's banned in your rank">
          Ban %
        </span>
      </div>
      {bans.map((b, i) => (
        <div key={b.champion.id} className="trow" role="row" title={b.reasons.join("\n")}>
          <span className="c-champ">
            <ChampIcon champ={b.champion} size={34} framed={i === 0} title="" />
            <span className="nm">{b.champion.name}</span>
          </span>
          <span className="c-bar" title={`Costs you ${signedPct(b.threat)} win chance`}>
            <span className="fill" style={{ width: `${Math.max(6, Math.round((-b.threat / worst) * 100))}%` }} />
          </span>
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
