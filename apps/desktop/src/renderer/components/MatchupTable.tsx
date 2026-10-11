import type { MatchupRowView } from "../../shared/view";
import { cx, positionLabel, rate, signedOrDash, t, tone } from "../format";
import { ChampIcon } from "./ChampIcon";

/** Within this (points of win chance either way) a pair plays as expected: "Even". */
const VERDICT_DEAD_ZONE = 0.01;

/** The matchup in a word, from the change against expectation: Favoured, Even or Hard. */
function verdict(delta: number | null): string {
  if (delta === null || Math.abs(delta) <= VERDICT_DEAD_ZONE) return "Even";
  return delta > 0 ? "Favoured" : "Hard";
}

/** "Hard −0.8", "Favoured +0.6", "Even": the verdict with its signed points (none inside the dead zone). */
function verdictText(delta: number | null): string {
  const word = verdict(delta);
  return word === "Even" ? word : `${word} ${signedOrDash(delta)}`;
}

function Row({ m }: { m: MatchupRowView }) {
  const where = [positionLabel(m.role), m.lane ? t("matchups.yourLane") : null, m.partner ? t("matchups.partner") : null].filter(Boolean).join(" · ");
  const v = tone(m.delta, VERDICT_DEAD_ZONE);
  return (
    <div className={cx("mrow", m.lane && "you")} title={m.games ? `${signedOrDash(m.delta)} points vs what both champions' usual win rates predict` : undefined}>
      <ChampIcon champ={m.champion} size={28} framed={m.lane} />
      <span className="who">
        <span className="t-heading">{m.champion!.name}</span>
        <span className="micro">{where}</span>
      </span>
      <span className="v">
        {m.games ? (
          <>
            <span className={cx("t-heading", v === "flat" ? "text" : v)}>{verdictText(m.delta)}</span>
            <span className="micro">{`${rate(m.winRate, 1)} WR · ${m.games.toLocaleString("en-US")} ${m.games === 1 ? "game" : "games"}`}</span>
          </>
        ) : (
          <span className="micro">{t("matchups.none")}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Your champion against (or with) each champion in the draft: your lane opponent first as a gold
 * row, then the others with games for the pair; pairs without games and seats not picked yet
 * are one line each.
 */
export function MatchupTable({ rows }: { rows: MatchupRowView[] }) {
  const picked = rows.filter((r) => r.champion);
  const open = rows.filter((r) => !r.champion);
  // Your lane opponent keeps its row even without games; other pairs without games are listed by name.
  const shown = picked.filter((r) => r.games || r.lane).sort((a, b) => Number(b.lane) - Number(a.lane) || Number(b.partner ?? false) - Number(a.partner ?? false));
  const noGames = picked.filter((r) => !r.games && !r.lane);
  return (
    <div className="matchups">
      {shown.map((m) => (
        <Row key={m.champion!.id} m={m} />
      ))}
      {noGames.length > 0 && (
        <div className="no-games">
          <span className="icons">
            {noGames.map((m) => (
              <ChampIcon key={m.champion!.id} champ={m.champion} size={20} />
            ))}
          </span>
          <span className="micro">{t("matchups.noGames", { names: noGames.map((m) => m.champion!.name).join(", ") })}</span>
        </div>
      )}
      {open.length > 0 && <span className="micro">{t("matchups.open", { roles: open.map((m) => positionLabel(m.role)).join(", ") })}</span>}
    </div>
  );
}
