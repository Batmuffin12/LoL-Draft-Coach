import type { MonthView } from "../../shared/view";
import { cx, pct, t, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";
import { Section } from "./Section";
import { RANK_AVERAGE, SlopeChart } from "./SlopeChart";

/** Number trends shown under the chart (only real changes); the rest go in "+n more". */
const TRENDS = 3;
/** Champion cards. */
const CHAMPIONS = 3;
/** The role bar's colours, most played first. */
const ROLE_FILLS = ["var(--gold)", "var(--frame)", "var(--line-strong)", "var(--card-raised)", "var(--line)"];

/** The month at a glance: games, your win rate before → now, and your roles as one bar with its legend. */
function Header({ m }: { m: MonthView }) {
  const now = winTone(m.winRate.to);
  return (
    <section className="section">
      <div className="section-head">
        <span className="label gold" title={m.rank ?? undefined}>{`${m.period} · ${m.games} ${m.games === 1 ? "game" : "games"}`}</span>
        <span className="rule" aria-hidden="true" />
        <span className="micro">{m.gamesBeforeText}</span>
      </div>
      <div className="winline">
        {m.winRate.from !== null && (
          <>
            <span className="t-number muted">{pct(m.winRate.from)}</span>
            <span className="t-heading muted" aria-hidden="true">
              →
            </span>
          </>
        )}
        <span className={cx("t-hero", now === "flat" ? "text" : now)}>{pct(m.winRate.to)}</span>
        <span className="caption">{m.winRate.text}</span>
      </div>
      {m.roles.length > 0 && (
        <div className="roles">
          <span className="rolebar" role="img" aria-label={m.roles.map((r) => r.text).join(", ")}>
            {m.roles.map((r, i) => (
              <span key={r.role} style={{ width: `${r.share * 100}%`, background: ROLE_FILLS[Math.min(i, ROLE_FILLS.length - 1)] }} />
            ))}
          </span>
          <span className="micro">
            {m.roles.map((r, i) => (
              <span key={r.role} className={i === 0 ? "text" : undefined}>
                {i > 0 && " · "}
                {r.text}
              </span>
            ))}
          </span>
        </div>
      )}
    </section>
  );
}

/** The monthly report: the month at a glance, your style before → now, and your champions. Trends, never a verdict on one game. */
export function MonthReport({ month: m }: { month: MonthView }) {
  const moved = m.stats.filter((s) => s.tone !== null);
  const shown = moved.slice(0, TRENDS);
  const rest = moved.slice(TRENDS);
  const met = m.focus.met;
  return (
    <>
      <Header m={m} />
      {m.role && m.axes.length > 0 && (
        <Section title={t("month.style", { role: m.role.toLowerCase() })} aside={<span className="micro">{t("month.average", { avg: RANK_AVERAGE })}</span>}>
          <SlopeChart axes={m.axes} role={m.role.toLowerCase()} />
          <span className="micro">{m.steadyNote}</span>
          {shown.length > 0 && (
            <span className="caption trends">
              {shown.map((s, i) => (
                <span key={s.label} title={s.title}>
                  {i > 0 && " · "}
                  {`${s.label} `}
                  <span className={s.tone ?? undefined}>{`${s.from ?? "—"} → ${s.to}`}</span>
                </span>
              ))}
              {rest.length > 0 && <span title={rest.map((s) => `${s.title}: ${s.from ?? "—"} → ${s.to}`).join("\n")}>{` · ${t("month.more", { n: rest.length })}`}</span>}
            </span>
          )}
        </Section>
      )}
      {m.champions.length > 0 && (
        <Section title={t("month.champions")} gold={false} aside={m.focusLine ? <span className="micro">{m.focusLine}</span> : undefined}>
          <div className="champcards">
            {m.champions.slice(0, CHAMPIONS).map((c) => {
              const wr = winTone(c.winRate);
              return (
                <div key={c.champion.id} className="champcard">
                  <ChampIcon champ={c.champion} size={28} />
                  <span className="who">
                    <span className="t-heading">{c.champion.name}</span>
                    <span className="micro">
                      <span className={wr === "flat" ? undefined : wr}>{pct(c.winRate)}</span>
                      {` · ${c.games} ${c.games === 1 ? "game" : "games"}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          {(met.length > 0 || m.focus.current) && (
            <span className="caption goals">
              {met.length > 0 && (
                <span title={met.join("\n")}>
                  {t("month.goalsMet", { first: met[0]! })}
                  {met.length > 1 ? ` ${t("month.goalsMore", { n: met.length - 1 })}` : ""}
                </span>
              )}
              {met.length > 0 && m.focus.current && " · "}
              {m.focus.current && <span className="gold">{m.focus.current}</span>}
            </span>
          )}
        </Section>
      )}
    </>
  );
}
