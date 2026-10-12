import type { PostGameView } from "../../shared/view";
import { cx, pct, positionLabel, signedOrDash, t, tone } from "../format";
import { ChampIcon } from "./ChampIcon";

/** "12 min ago", "3 h ago", "yesterday", "4 days ago". */
function ago(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * The result band: your champion, the result, the game in a line, and whether you took the
 * coach's pick with its chance. Describes the game; never grades it.
 */
export function ResultBand({ game: g, now }: { game: PostGameView; now: number }) {
  const where = [g.champion.name, g.role && positionLabel(g.role), g.minutes !== null ? `${g.minutes} min` : null, ago(g.endedAt ?? g.lockedAt, now)].filter(Boolean).join(" · ");
  const took = g.shown.find((s) => s.took);
  // The short form on the card; the full prediction (with the #1 suggestion's chance) on hover.
  const chance = took?.expectedWin != null ? t("last.lockedChance", { chance: pct(took.expectedWin) }) : g.prediction;
  const line = [g.verdict, chance].filter(Boolean).join(" · ");
  const hover = [g.prediction, g.shown.length ? `Coach suggested: ${g.shown.map((s) => `${s.champion.name}${s.expectedWin === null ? "" : ` ${pct(s.expectedWin)}`}`).join(", ")}` : null].filter(Boolean).join("\n");
  return (
    <section className={cx("result-band", `is-${g.result ?? "pending"}`)}>
      <ChampIcon champ={g.champion} size={44} framed />
      <div className="who">
        <span className={cx("t-title t-call", g.result === "win" ? "pos" : g.result === "loss" ? "neg" : "muted")} title={g.result ? undefined : "The result arrives once the server has synced your game"}>
          {g.result === "win" ? "Victory" : g.result === "loss" ? "Defeat" : "Result soon"}
        </span>
        <span className="caption text">{where}</span>
        {line && (
          <span className="micro" title={hover || undefined}>
            {line}
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * What decided the draft: the parts of your pick's chance at lock-in as signed points on a
 * bar centred at 0, scaled to the biggest. Old entries without them show their reason lines.
 */
export function DraftTerms({ game: g }: { game: PostGameView }) {
  if (!g.terms.length) {
    return g.lines.length ? (
      <ul className="reasons">
        {g.lines.map((r) => (
          <li key={r.text} className={r.negative ? "but" : undefined}>
            {r.text}
          </li>
        ))}
      </ul>
    ) : null;
  }
  const max = Math.max(...g.terms.map((x) => Math.abs(x.deltaWin)));
  return (
    <div className="terms">
      {g.terms.map((x) => {
        const w = max > 0 ? (Math.abs(x.deltaWin) / max) * 50 : 0;
        const v = tone(x.deltaWin);
        return (
          <div key={x.label} className="fx">
            <span>{x.label}</span>
            <span className="bar" role="img" aria-label={`${x.label}: ${signedOrDash(x.deltaWin)} points`}>
              <span className="zero" />
              <span className={cx("fill", v)} style={x.deltaWin >= 0 ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} />
            </span>
            <span className={cx("t-heading val", v === "flat" ? "text" : v)}>{signedOrDash(x.deltaWin)}</span>
          </div>
        );
      })}
    </div>
  );
}
