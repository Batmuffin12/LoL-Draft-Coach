import type { ViewState } from "../../shared/view";
import { MonthReport } from "../components/MonthReport";
import { Section } from "../components/Section";
import { lobbyEmpty, t } from "../format";

/** The monthly report: your last 30 days against the 30 before, from your own games. */
export function Month({ state }: { state: ViewState }) {
  const m = state.month;
  if (!m) return <Section title={t("tabs.month")}><p className="caption">{lobbyEmpty(state.status, "month", { n: state.limits.monthDays })}</p></Section>;
  return <MonthReport month={m} />;
}
