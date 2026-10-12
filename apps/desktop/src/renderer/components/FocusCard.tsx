import type { FocusView, PostGameView } from "../../shared/view";
import { cx, t } from "../format";

/** Games shown as squares under the goal. */
const SQUARES = 10;

/**
 * One goal on your main champion and role: this game's value in a ring (green when it met the
 * goal, amber when not; your average without a game), whether it was met, your average against
 * typical, your last games as squares, and one thing for the next game.
 */
export function FocusCard({ focus: f, game }: { focus: FocusView; game: PostGameView["focus"] }) {
  const recent = f.recent.slice(-SQUARES);
  return (
    <div className="goal">
      <span className="t-title">{f.title}</span>
      <div className="goal-body">
        <div className={cx("goal-ring", game ? (game.met ? "met" : "missed") : "none")} title={game ? `${game.label}: ${game.value} this game · goal ${game.target}` : `Your average over your last ${f.checkGames} games`}>
          <span className={cx("t-hero", game ? (game.met ? "pos" : "neg") : "text")}>{game ? game.value : f.youText}</span>
          <span className="micro">{game ? t("last.thisGame") : t("last.yourAverage")}</span>
        </div>
        <div className="goal-side">
          {game ? (
            <span className={cx("t-heading", game.met ? "pos" : "neg")}>{game.met ? f.metLine : f.missedLine}</span>
          ) : (
            <span className="t-heading" title={f.goalHint}>
              {t("last.goalIs", { goal: f.goalText })}
            </span>
          )}
          <span className="caption" title={f.why || f.whyHover}>{`${f.averageLine} ${f.typicalLine}.`}</span>
          {recent.length > 0 && (
            <span className="squares" title="Filled: you met the goal in that game" role="img" aria-label={f.streak}>
              {recent.map((ok, i) => (
                <span key={i} className={cx("sq", ok && "met")} />
              ))}
            </span>
          )}
          <span className="micro">{f.streak}</span>
        </div>
      </div>
      {f.tips[0] && (
        <span className="caption next" title={f.tips.slice(1).join("\n") || undefined}>
          <span className="label gold">{t("last.next")}</span> <span className="text">{f.tips[0]}</span>
        </span>
      )}
    </div>
  );
}
