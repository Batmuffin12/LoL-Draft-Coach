import type { ViewState } from "../../shared/view";
import { Facts } from "../components/Facts";
import { RoleChoice } from "../components/ChoiceGroup";
import { EmptyState } from "../components/EmptyState";
import { Section } from "../components/Section";
import { howLines, NumberRows } from "../components/StyleNumbers";
import { StyleRadar } from "../components/StyleRadar";
import { gameCount, lobbyEmpty, roleGamesProgress, roleName, t, tip } from "../format";
import { useFits, useRolePill } from "../hooks";

/** No axis stands out: a chart would only say what one sentence can. */
export function isEvenStyle(axes: ViewState["playstyle"][number]["axes"]): boolean {
  return axes.length > 0 && axes.every((a) => a.level === "mid");
}

/** Your style per role: role choice, the radar against your rank (or a sentence when you're close to it on everything), a one-line summary, then your numbers vs your rank. */
export function Style({ state }: { state: ViewState }) {
  const [sub, setSub] = useRolePill(state.playstyle.map((p) => p.role));
  // Many strengths and weak spots: the note under your numbers moves to hover.
  const fits = useFits(sub);
  if (!state.playstyle.length) return <EmptyState message={lobbyEmpty(state.status, "style", { n: state.limits.styleGames })} progress={roleGamesProgress(state, state.limits.styleGames)} />;
  const summary = (p: ViewState["playstyle"][number]) => {
    const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
    const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
    return [gameCount(p.games), high.length ? t("style.pillStrong", { list: high.join(", ") }) : null, low.length ? t("style.pillGrow", { list: low.join(", ") }) : null].filter(Boolean).join(" · ");
  };
  const p = state.playstyle.find((x) => x.role === sub) ?? state.playstyle[0]!;
  // How you play (pool, classes, damage) and the side split are on hover over the numbers' head.
  const how = [...(p.how ? howLines(p.how) : []), ...(state.side ? [state.side] : [])].join("\n");
  const even = isEvenStyle(p.axes);
  return (
    <>
      <section className="section style-top">
        <RoleChoice
          roles={state.playstyle.map((x) => x.role)}
          about={(role) => summary(state.playstyle.find((x) => x.role === role)!)}
          value={p.role}
          onChange={setSub}
          end={even ? gameCount(p.games) : `${gameCount(p.games)} · ${t("style.dashed")}`}
        />
        {even ? (
          <p className="t-heading style-even" {...tip(p.axes.map((a) => `${a.label} ${a.score}`).join("\n"))}>
            {p.summary[0]?.items[0]?.text}
          </p>
        ) : (
          <>
            <StyleRadar axes={p.axes} role={roleName(p.role)} />
            {p.summary.length > 0 && <Facts rows={p.summary} flow />}
          </>
        )}
      </section>
      {p.numbers.length > 0 && (
        <Section title={t("style.numbers")} aside={<span className="micro" {...tip(fits ? how : [t("style.numbersNote"), how].filter(Boolean).join("\n"))}>{t("style.legend")}</span>}>
          <NumberRows items={p.numbers} />
          {fits && <span className="micro">{t("style.numbersNote")}</span>}
        </Section>
      )}
    </>
  );
}
