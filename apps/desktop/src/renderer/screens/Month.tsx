import type { ViewState } from "../../shared/view";
import { MonthReport } from "../components/MonthReport";
import { EmptyState } from "../components/EmptyState";
import { lobbyEmpty } from "../format";

/** The monthly report: your last 30 days against the 30 before, from your own games. */
export function Month({ state }: { state: ViewState }) {
  const m = state.month;
  if (!m) return <EmptyState message={lobbyEmpty(state.status, "month", { n: state.limits.monthDays })} />;
  return <MonthReport month={m} />;
}
