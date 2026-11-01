import type { MonthView } from "../../shared/view";
import { cx, gameCount, isThin, pct, t, tip, winToneOf } from "../format";
import { useFitLevel } from "../hooks";
import { ChampIcon } from "./ChampIcon";
import { Section } from "./Section";
import { StyleShifts } from "./StyleShifts";

/** Number trends shown under the style rows (only real changes); the rest go in "+n more". */
const TRENDS = 3;
/** Champion cards. */
const CHAMPIONS = 3;
/** The role bar's colours, most played first. */
const ROLE_FILLS = ["var(--gold)", "var(--frame)", "var(--line-strong)", "var(--card-raised)", "var(--line)"];

/** A met goal by its name: "Deaths before 14 min: 3.5 → 2.7, goal met" → "Deaths before 14 min" (the numbers are on hover). */
const goalName = (s: string) => (s.includes(":") ? s.slice(0, s.indexOf(":")) : s);

/** The month at a glance: games, your win rate before → now, and your roles as one bar with its legend (on hover only when `brief`). */
function Header({ m, brief }: { m: MonthView; brief: boolean }) {
  const now = winToneOf(m.winRate.to, m.games);
  return (
    <section className="section">
      <div className="section-head">
        <span className="label" {...tip(m.rank)}>{`${m.period} · ${gameCount(m.games)}`}</span>
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
        <span className={cx(isThin(m.games) ? "t-number" : "t-hero", now === "flat" ? "text" : now)}>{pct(m.winRate.to)}</span>
        <span className="caption">{m.winRate.text}</span>
      </div>
      {m.roles.length > 0 && (
        <div className="roles">
          <span className="rolebar" role="img" aria-label={m.roles.map((r) => r.text).join(", ")} {...tip(brief ? m.roles.map((r) => r.text).join(" · ") : null)}>
            {m.roles.map((r, i) => (
              <span key={r.role} style={{ width: `${r.share * 100}%`, background: ROLE_FILLS[Math.min(i, ROLE_FILLS.length - 1)] }} />
            ))}
          </span>
          {!brief && (
            <span className="micro">
              {m.roles.map((r, i) => (
                <span key={r.role} className={i === 0 ? "text" : undefined}>
                  {i > 0 && " · "}
                  {r.text}
                </span>
              ))}
            </span>
          )}
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
  // Long months (many axes, long names): first the trend line, then the goal lines, then the roles' legend move to hover, so nothing scrolls.
  const level = useFitLevel(m, 3);
  const showTrends = level < 1;
  const showGoals = level < 2;
  // What the compact form shows on hover instead: the trends, the goals met and the current goal.
  const hidden = [...(showTrends ? [] : moved.map((s) => `${s.title}: ${s.from ?? "—"} → ${s.to}`)), ...(showGoals ? [] : [...met, ...(m.focus.current ? [m.focus.current] : [])])];
  return (
    <>
      <Header m={m} brief={level > 2} />
      {m.role && m.axes.length > 0 && (
        <Section title={t("month.style", { role: m.role.toLowerCase() })} aside={<span className="micro" {...tip(hidden.join("\n"))}>{m.steadyNote}</span>}>
          <StyleShifts axes={m.axes} />
          {showTrends && shown.length > 0 && (
            <span className="caption trends">
              {shown.map((s) => (
                <span key={s.label} title={s.title}>
                  {`${s.label} `}
                  <span className={s.tone ?? undefined}>{`${s.from ?? "—"} → ${s.to}`}</span>
                </span>
              ))}
              {rest.length > 0 && <span {...tip(rest.map((s) => `${s.title}: ${s.from ?? "—"} → ${s.to}`).join("\n"))}>{t("month.more", { n: rest.length })}</span>}
            </span>
          )}
        </Section>
      )}
      {m.champions.length > 0 && (
        <Section title={t("month.champions")} aside={m.focusLine ? <span className="micro">{m.focusLine}</span> : undefined}>
          <div className="champcards">
            {m.champions.slice(0, CHAMPIONS).map((c) => {
              const wr = winToneOf(c.winRate, c.games);
              return (
                <div key={c.champion.id} className="champcard">
                  <ChampIcon champ={c.champion} size={24} />
                  <span className="who">
                    <span className="t-heading">{c.champion.name}</span>
                    <span className="micro">
                      <span className={wr === "flat" ? undefined : wr}>{pct(c.winRate)}</span>
                      {` · ${gameCount(c.games)}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          {showGoals && (met.length > 0 || m.focus.current) && (
            <span className="caption goals">
              {met.length > 0 && (
                <span {...tip(met.join("\n"))}>
                  {t("month.goalsMet", { first: goalName(met[0]!) })}
                  {met.length > 1 ? ` ${t("month.goalsMore", { n: met.length - 1 })}` : ""}
                </span>
              )}
              {m.focus.current && <span className="text">{m.focus.current}</span>}
            </span>
          )}
        </Section>
      )}
    </>
  );
}
