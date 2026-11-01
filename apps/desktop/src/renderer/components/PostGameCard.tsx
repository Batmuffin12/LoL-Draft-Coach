import type { PostGameView } from "../../shared/view";
import { ago, cx, pct, positionLabel, signedOrDash, t, tip, tone, winsPer100 } from "../format";
import { ChampIcon } from "./ChampIcon";

/**
 * The result band: your champion, the result, the game in a line, and whether you took the
 * coach's pick with its chance. Describes the game; never grades it.
 */
export function ResultBand({ game: g, now, overdue = false }: { game: PostGameView; now: number; overdue?: boolean }) {
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
        <span className={cx("t-title t-call", g.result === "win" ? "pos" : g.result === "loss" ? "neg" : "muted")} title={g.result ? undefined : t(overdue ? "last.noResultHint" : "last.resultSoonHint")}>
          {g.result === "win" ? "Victory" : g.result === "loss" ? "Defeat" : t(overdue ? "last.noResult" : "last.resultSoon")}
        </span>
        <span className="caption text">{where}</span>
        {line && (
          <span className="micro" {...tip(hover)}>
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
        const text = t("last.termTip", { label: x.label, signed: signedOrDash(x.deltaWin), wins: winsPer100(x.deltaWin) });
        return (
          <div key={x.label} className="fx" {...tip(text)}>
            <span>{x.label}</span>
            <span className="bar" role="img" aria-label={text}>
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
