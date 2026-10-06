import { Fragment } from "react";
import type { LoadoutView } from "../../shared/view";
import { cx, games, rate, skillPath } from "../format";
import { ChampIcon } from "./ChampIcon";

type Spells = NonNullable<LoadoutView["spells"]>;
type Skills = NonNullable<LoadoutView["skills"]>;

/** "53.2% · 1,980" with the win rate in green; with thin data (no win rate) just "1,980 games". */
export function Stat({ winRate, n, title }: { winRate: number | null; n: number; title?: string }) {
  if (winRate === null) {
    return (
      <span className="stat" title={title}>
        {`${games(n)} ${n === 1 ? "game" : "games"}`}
      </span>
    );
  }
  return (
    <span className="stat" title={title}>
      <b className="pos">{rate(winRate, 1)}</b>
      {` · ${games(n)}`}
    </span>
  );
}

/** The two spells, the max order as keycaps with its numbers, then a Q/W/E/R × level 1–18 grid (the ultimate at 6, 11 and 16 on its own row). */
export function SkillGrid({ spells, skills }: { spells: Spells | null; skills: Skills | null }) {
  const path = skills ? skillPath(skills.first, skills.order, skills.ult) : [];
  const spellTip = spells && [`${spells.spells.map((s) => s.name).join(" + ")}: ${rate(spells.winRate, 1)} win, ${games(spells.games)} games`, spells.reason].filter(Boolean).join("\n");
  return (
    <div className="skillgrid">
      <div className="maxrow">
        {spells && (
          <span className="spells" title={spellTip ?? undefined}>
            {spells.spells.map((s) => (
              <ChampIcon key={s.id} champ={s} kind="game" size={28} title={spellTip ?? s.name} />
            ))}
          </span>
        )}
        {skills && (
          <>
            <span className="label">Max</span>
            {skills.order.map((k, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="sep">›</span>}
                <span className="key max">{k}</span>
              </Fragment>
            ))}
            <Stat winRate={skills.winRate} n={skills.games} title={skills.reason ?? undefined} />
          </>
        )}
      </div>
      {skills && (
        <div className="grid" role="table" aria-label="Skill per level">
          {[...skills.basic, skills.ult].map((k) => (
            <div key={k} className="g-row" role="row">
              <span className="g-key">{k}</span>
              {path.map((x, i) => (
                <span key={i} className={cx("g-cell", x === k && "on", x === k && k === skills.ult && "ult")}>
                  {x === k ? i + 1 : ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
