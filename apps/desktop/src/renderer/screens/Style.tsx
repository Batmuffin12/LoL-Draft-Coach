import type { ViewState } from "../../shared/view";
import { Facts } from "../components/Facts";
import { RoleChoice } from "../components/ChoiceGroup";
import { Section } from "../components/Section";
import { howLines, NumberRows } from "../components/StyleNumbers";
import { StyleRadar } from "../components/StyleRadar";
import { gameCount, lobbyEmpty, roleName, t, tip } from "../format";
import { useFits, useRolePill } from "../hooks";

/** Your style per role: role pills, the radar against your rank, a one-line summary, then your numbers vs your rank. */
export function Style({ state }: { state: ViewState }) {
  const [sub, setSub] = useRolePill(state.playstyle.map((p) => p.role));
  // Many strengths and weak spots: the note under your numbers moves to hover.
  const fits = useFits(sub);
  if (!state.playstyle.length) return <Section title={t("style.head")}><p className="caption">{lobbyEmpty(state.status, "style", { n: state.limits.styleGames })}</p></Section>;
  const summary = (p: ViewState["playstyle"][number]) => {
    const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
    const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
    return [gameCount(p.games), high.length ? t("style.pillStrong", { list: high.join(", ") }) : null, low.length ? t("style.pillGrow", { list: low.join(", ") }) : null].filter(Boolean).join(" · ");
  };
  const p = state.playstyle.find((x) => x.role === sub) ?? state.playstyle[0]!;
  // How you play (pool, classes, damage) and the side split are on hover over the numbers' head.
  const how = [...(p.how ? howLines(p.how) : []), ...(state.side ? [state.side] : [])].join("\n");
  return (
    <>
      <section className="section style-top">
        <RoleChoice
          roles={state.playstyle.map((x) => x.role)}
          about={(role) => summary(state.playstyle.find((x) => x.role === role)!)}
          value={p.role}
          onChange={setSub}
          end={`${gameCount(p.games)} · ${t("style.dashed")}`}
        />
        <StyleRadar axes={p.axes} role={roleName(p.role)} />
        {p.summary.length > 0 && <Facts rows={p.summary} flow />}
      </section>
      {p.numbers.length > 0 && (
        <Section title={t("style.numbers")} aside={<span className="micro" {...tip(fits ? how : [t("style.numbersNote"), how].filter(Boolean).join("\n"))}>{t("style.legend")}</span>}>
          <div data-tour="numbers">
            <NumberRows items={p.numbers} />
          </div>
          {fits && <span className="micro">{t("style.numbersNote")}</span>}
        </Section>
      )}
    </>
  );
}
