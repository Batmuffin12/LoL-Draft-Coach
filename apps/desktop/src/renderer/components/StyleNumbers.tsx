import type { PlaystyleView } from "../../shared/view";
import { cx, pct } from "../format";

/**
 * Your headline numbers against your rank: a track with the rank average at the middle and a dot
 * for you (right is better, lower-is-better numbers already turned), then yours vs typical.
 */
export function NumberRows({ items }: { items: PlaystyleView["numbers"] }) {
  return (
    <div className="bullets">
      {items.map((n) => (
        <div key={n.label} className="bl" title={n.title}>
          <span>{n.label}</span>
          <span className="bt" aria-hidden="true">
            <span className="avg" />
            <span className={cx("me", n.tone ?? "flat")} style={{ left: `${50 + Math.max(-1, Math.min(1, n.relative)) * 50}%` }} />
          </span>
          <span className="caption val">
            <b className={cx("t-heading", n.tone ?? "text")}>{n.you}</b> vs {n.typical}
          </span>
        </div>
      ))}
    </div>
  );
}

/** How you play the role, as tooltip lines: pool focus, classes and damage split. */
export function howLines(how: NonNullable<PlaystyleView["how"]>): string[] {
  return [
    `Pool: ${how.focus} · ${how.champions}`,
    how.classes.length ? `Classes: ${how.classes.map((c) => `${c.label} ${pct(c.share)}`).join(" · ")}` : null,
    how.damage ? `Damage: ${how.damage.map((d) => `${d.label} ${pct(d.share)}`).join(" · ")}` : null,
  ].filter((x): x is string => x !== null);
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
