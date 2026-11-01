import { Fragment } from "react";
import type { LoadoutView } from "../../shared/view";
import { cx, gameCount, rateOf, skillPath, winToneOf } from "../format";
import { ChampIcon } from "./ChampIcon";

type Spells = NonNullable<LoadoutView["spells"]>;
type Skills = NonNullable<LoadoutView["skills"]>;

/** "53.2% WR · 1,980 games" with the win rate coloured from 50%, neutral and whole below the shared minimum; with thin data (no win rate) just "1,980 games". */
export function Stat({ winRate, n, title, short }: { winRate: number | null; n: number; title?: string; short?: boolean }) {
  if (winRate === null) {
    return (
      <span className="stat" title={title}>
        {gameCount(n)}
      </span>
    );
  }
  const wr = winToneOf(winRate, n);
  return (
    <span className="stat" title={title}>
      <b className={wr === "flat" ? undefined : wr}>{rateOf(winRate, n)}</b>
      {short ? " WR" : ` WR · ${gameCount(n)}`}
    </span>
  );
}

/** The two spells, the max order as keycaps with its numbers, then a Q/W/E/R × level 1–18 grid (the ultimate at 6, 11 and 16 on its own row). */
export function SkillGrid({ spells, skills }: { spells: Spells | null; skills: Skills | null }) {
  const path = skills ? skillPath(skills.first, skills.order, skills.ult) : [];
  const spellTip = spells && [`${spells.spells.map((s) => s.name).join(" + ")}: ${rateOf(spells.winRate, spells.games)} WR, ${gameCount(spells.games)}`, spells.reason].filter(Boolean).join("\n");
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
            <span className="label">Priority</span>
            {skills.order.map((k, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="sep">›</span>}
                <span className="key max">{k}</span>
              </Fragment>
            ))}
            <Stat short winRate={skills.winRate} n={skills.games} title={[gameCount(skills.games), skills.reason].filter(Boolean).join(" · ")} />
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
