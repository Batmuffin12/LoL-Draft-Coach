import type { PostGameView } from "../../shared/view";
import { cx, pct, positionLabel } from "../format";
import { ChampIcon } from "./ChampIcon";

/** "12 min ago", "3 h ago", "yesterday", "4 days ago". */
export function ago(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * The last game against the advice: your pick, the result, the picks the coach showed (yours lit),
 * whether you took one, and what mattered most in the draft. Describes the game; never grades it.
 */
export function PostGameCard({ game: g, now }: { game: PostGameView; now: number }) {
  const where = [g.role && positionLabel(g.role), g.minutes !== null ? `${g.minutes} min` : null, ago(g.endedAt ?? g.lockedAt, now)].filter(Boolean).join(" · ");
  return (
    <div className="postgame">
      <div className="pg-top">
        <ChampIcon champ={g.champion} size={44} framed />
        <div className="who">
          <span className="label gold">{where}</span>
          <span className="nm">{g.champion.name}</span>
        </div>
        <span className={cx("result", g.result ?? "pending")} title={g.result ? undefined : "The result arrives once the server has synced your game"}>
          {g.result === "win" ? "Win" : g.result === "loss" ? "Loss" : "Result soon"}
        </span>
      </div>
      {g.shown.length > 0 && (
        <div className="shown" title="What the coach suggested when you locked in">
          <span className="label">Shown</span>
          <span className="opts">
            {g.shown.map((s, i) => (
              <span key={s.champion.id} className={cx("opt", s.took && "took")}>
                <ChampIcon champ={s.champion} size={22} lit={s.took} title={s.champion.name} />
                {s.expectedWin === null ? `#${i + 1}` : pct(s.expectedWin)}
              </span>
            ))}
          </span>
          <span className={cx("verdict", g.followed ? "followed" : "own")}>{g.verdict}</span>
        </div>
      )}
      {g.lines.length > 0 && (
        <ul className="reasons">
          {g.lines.map((r) => (
            <li key={r.text} className={r.negative ? "but" : undefined}>
              {r.text}
            </li>
          ))}
        </ul>
      )}
      {g.prediction && <span className="caption">{g.prediction}</span>}
      {g.focus && (
        <div className="item-row" title="Your focus metric in this game against its target">
          <span className="label k">Focus</span>
          <span className="caption one-line">
            <b className={g.focus.met ? "pos" : "text"}>{`${g.focus.label}: ${g.focus.value}`}</b>
            {` this game · target ${g.focus.target}`}
          </span>
        </div>
      )}
    </div>
  );
}
