import { EmptyState } from "../components/EmptyState";
import { FocusCard } from "../components/FocusCard";
import { ProgressRow } from "../components/ProgressRow";
import { DraftTerms, ResultBand } from "../components/PostGameCard";
import { Section } from "../components/Section";
import { resultOverdue, type ViewState } from "../../shared/view";
import { t } from "../format";
import { useNow } from "../hooks";

/** Your last game against the advice the coach gave (the advice log). */
export function LastGame({ state }: { state: ViewState }) {
  const now = useNow(60_000);
  const g = state.lastGame;
  return (
    <>
      {state.lastGamePending && (
        <div className="notices">
          <ProgressRow text={t("last.pending")} />
        </div>
      )}
      {g ? (
        <>
          <ResultBand game={g} now={now} overdue={resultOverdue(g, { pending: state.lastGamePending, gaveUp: state.lastGameGaveUp }, now)} />
          {(g.terms.length > 0 || g.lines.length > 0) && (
            <Section title={t("last.decided")}>
              <DraftTerms game={g} />
            </Section>
          )}
        </>
      ) : (
        !state.lastGamePending && <EmptyState message={t("last.empty")} hint={t("last.emptyHint")} inline={state.focus !== null} />
      )}
      {state.focus && (
        <Section title={t("last.goal")} aside={<span className="micro">{state.focus.on}</span>}>
          <FocusCard focus={state.focus} game={g?.focus ?? null} />
        </Section>
      )}
    </>
  );
}
