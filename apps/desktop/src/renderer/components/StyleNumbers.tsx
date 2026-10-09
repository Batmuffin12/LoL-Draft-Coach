import type { PlaystyleView } from "../../shared/view";
import { cx, pct } from "../format";

/** Headline numbers, three to a row: yours big, typical in your rank under it. */
export function NumberGrid({ items }: { items: PlaystyleView["numbers"] }) {
  return (
    <div className="strip numgrid">
      {items.map((n) => (
        <div key={n.label} className={cx("tile", n.tone)} title={n.title}>
          <span className="k">{n.label}</span>
          <span className="vrow">
            <span className="v">{n.you}</span>
            <span className="s">{`typical ${n.typical}`}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** How you play the role: pool focus, classes and damage split, one line each. */
export function HowYouPlay({ how }: { how: NonNullable<PlaystyleView["how"]> }) {
  return (
    <div className="how">
      <div className="how-row" title={`Share of your last ${how.games} games on your most played champions`}>
        <span className="how-k">Pool</span>
        <span className="how-v">{`${how.focus} · ${how.champions}`}</span>
      </div>
      {how.classes.length > 0 && (
        <div className="how-row" title="Data Dragon's class of the champion in each game">
          <span className="how-k">Classes</span>
          <span className="how-v">{how.classes.map((c) => `${c.label} ${pct(c.share)}`).join(" · ")}</span>
        </div>
      )}
      {how.damage && (
        <div className="how-row" title="Your damage to champions by type">
          <span className="how-k">Damage</span>
          <span className="how-v dmg">
            <span className="dmgbar" aria-hidden="true">
              {how.damage.map((d) => (
                <span key={d.kind} className={d.kind} style={{ width: `${d.share * 100}%` }} />
              ))}
            </span>
            {how.damage.map((d) => (
              <span key={d.kind} className={cx("dmg-l", d.kind)}>{`${d.label} ${pct(d.share)}`}</span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
