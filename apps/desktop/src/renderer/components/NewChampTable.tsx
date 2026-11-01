import type { NewChampView } from "../../shared/view";
import { cx, gameCount, rateOf, t, winToneOf } from "../format";
import { ChampIcon } from "./ChampIcon";

const EASE = { 1: "easy", 2: "medium", 3: "hard" } as const;

/** New champions for one role: the champion of yours it's most like, its win rate in your rank, ease; one reason under each (on hover only when `brief`). */
export function NewChampTable({ rows, brief = false }: { rows: NewChampView[]; brief?: boolean }) {
  return (
    <div className="table newchamps" role="table">
      <div className="thead" role="row">
        <span className="c-champ">{t("label.champion")}</span>
        <span className="c-num" title={t("new.likeTip")}>
          {t("new.likeHead")}
        </span>
        <span className="c-num" title={t("new.winRateTip")}>
          {t("label.winRate")}
        </span>
        <span className="c-num" title={t("new.difficultyTip")}>
          {t("new.difficulty")}
        </span>
      </div>
      {rows.map((c, i) => (
        <div key={c.champion.id} className="trow" role="row" title={c.reasons.join("\n")}>
          <span className="c-champ">
            <ChampIcon champ={c.champion} size={34} framed={i === 0} title="" />
            <span className="nm">{c.champion.name}</span>
            {c.owned === false && (
              <span className="tag" title={t("new.notOwnedTip")}>
                {t("new.notOwned")}
              </span>
            )}
          </span>
          <span className="like">
            {c.like ? (
              <>
                <ChampIcon champ={c.like} size={24} title={t("new.likeYour", { champion: c.like.name })} />
                <span className="wrap">{c.like.name}</span>
              </>
            ) : (
              "—"
            )}
          </span>
          <span className={cx("c-num", winToneOf(c.winRate, c.games))} title={gameCount(c.games)}>
            {rateOf(c.winRate, c.games)}
          </span>
          <span className={cx("c-num ease", EASE[c.ease])}>{c.easeLabel}</span>
          {c.reasons[0] && !brief && <span className="sub">{c.reasons[0]}</span>}
        </div>
      ))}
    </div>
  );
}
