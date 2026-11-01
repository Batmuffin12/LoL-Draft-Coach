import type { LearnView, ViewState } from "../../shared/view";
import { ChampIcon } from "../components/ChampIcon";
import { Facts } from "../components/Facts";
import { NewChampTable } from "../components/NewChampTable";
import { RoleChoice } from "../components/ChoiceGroup";
import { EmptyState } from "../components/EmptyState";
import { Section } from "../components/Section";
import { cx, lobbyEmpty, roleGamesProgress, roleName, t, tip } from "../format";
import { useFitLevel, useRolePill } from "../hooks";

/** New champions per role (a sub-tab each): meta in your rank, like what you play well; first-games plan under the table. */
export function NewChamps({ state }: { state: ViewState }) {
  const list = state.newChamps.filter((r) => r.picks.length || r.learning);
  const [sub, setSub] = useRolePill(list.map((r) => r.role));
  // Long plans: first each row's entries go side by side, then the picks' reasons or the picks after your current champion move to hover, then the minor rows and the other picks.
  const level = useFitLevel(sub, 3);
  if (!list.length) {
    const ready = state.meta?.state === "ready";
    return <EmptyState message={ready ? lobbyEmpty(state.status, "new", { n: state.limits.poolGames }) : t("new.noMeta")} progress={ready ? roleGamesProgress(state, state.limits.poolGames) : null} />;
  }
  const summary = (r: (typeof list)[number]) => (r.learning ? [r.learning.title, r.learning.progress].filter(Boolean).join(" · ") : r.picks.map((p) => p.champion.name).join(", "));
  return (
    <>
      <section className="section filter-row">
        <RoleChoice roles={list.map((r) => r.role)} about={(role) => summary(list.find((r) => r.role === role)!)} value={sub} onChange={setSub} />
      </section>
      {list.filter((r) => r.role === sub).map((r) => {
        const title = t("new.head", { role: roleName(r.role) });
        const l = r.learning;
        return (
          <Section key={r.role} title={title} aside={<span className="micro">{t("new.aside")}</span>}>
            {l && (
              <div className="plan learning" {...tip(level > 2 ? minorText(l.learn) : null)}>
                <div className="learning-head">
                  {l.champion && <ChampIcon champ={l.champion} size={28} />}
                  <span className="label">{l.title}</span>
                  {l.progress && <span className="micro">{l.progress}</span>}
                </div>
                <Learn learn={l.learn} level={level} />
              </div>
            )}
            {l && r.picks.length > 0 && (
              <span className="label" {...tip(level > 1 ? [l.why, ...r.picks.map((p) => p.champion.name)].join("\n") : l.why)}>
                {l.after} <span className="micro">· {l.why}</span>
              </span>
            )}
            {r.picks.length > 0 && !(l && level > 1) && (
              <div className={l ? "after-learning" : undefined}>
                <NewChampTable rows={level > 2 ? r.picks.slice(0, 1) : r.picks} brief={level > 1} />
              </div>
            )}
            {r.plan && (
              <div className="plan" {...tip(level > 2 && r.planLearn ? [r.picks.slice(1).map((p) => p.champion.name).join(", "), minorText(r.planLearn)].filter(Boolean).join("\n") : null)}>
                <span className="label">{t("new.plan")}</span>
                <span>{r.plan}</span>
                {r.planLearn && <Learn learn={r.planLearn} level={level} />}
              </div>
            )}
          </Section>
        );
      })}
    </>
  );
}

/** The rows a short screen moved to hover. */
function minorText(learn: LearnView): string {
  return learn.lines
    .filter((r) => r.minor)
    .map((r) => `${r.label}: ${r.items.map((i) => i.text).join(", ")}`)
    .join("\n");
}

/** How to learn a champion: the one thing to watch next game (with your last games on it) under its stage, then short facts. */
function Learn({ learn, level }: { learn: LearnView; level: number }) {
  const f = learn.focus;
  return (
    <>
      {f ? (
        <div className="learn-focus" title={t("new.squaresTip")}>
          <span className="label gold">{learn.stage ? t("new.thisGameStage", { stage: learn.stage }) : t("new.thisGame")}</span>
          <span>{f.text}</span>
          {f.recent.length > 0 && (
            <span className="games">
              {f.recent.map((ok, i) => (
                <span key={i} className={cx("g", ok && "met")} />
              ))}
            </span>
          )}
        </div>
      ) : (
        learn.stage && <span className="label">{learn.stage}</span>
      )}
      {learn.lines.length > 0 && <Facts rows={level > 2 ? learn.lines.filter((r) => !r.minor) : learn.lines} flow={level > 0} />}
    </>
  );
}
