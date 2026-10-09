import type { MonthView } from "../../shared/view";
import { cx, rate, signedPct, tone, winTone } from "../format";
import { ChampIcon } from "./ChampIcon";
import { Section } from "./Section";

/** Fixed tiles: label on top, big value under. */
export function StatStrip({ items }: { items: MonthView["strip"] }) {
  return (
    <div className="strip" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className={cx("tile", it.tone)}>
          <span className="k">{it.label}</span>
          <span className="v">{it.value}</span>
          {it.sub && (
            <span className="s" title={it.sub}>
              {it.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Playstyle axes over the month, two to a row: last period → this one; coloured only when the change is real (tested). */
export function TrendTable({ rows }: { rows: MonthView["axes"] }) {
  return (
    <div className="trends2" role="table">
      {rows.map((r) => {
        const d = r.from === null ? null : r.to - r.from;
        const t = r.changed === "up" ? "pos" : r.changed === "down" ? "neg" : "flat";
        return (
          <div key={r.label} className="tr" role="row" title={`${r.label}: ${r.from ?? "—"} last period, ${r.to} this period (50 = typical)${r.changed === "steady" ? ": no real change" : r.changed === null ? ": too few games to tell" : ""}`}>
            <span className="axis-nm one-line">{r.label}</span>
            <span className="num muted">{r.from ?? "—"}</span>
            <span className={cx("arrow", t)} aria-hidden="true">
              {t === "pos" ? "▲" : t === "neg" ? "▼" : ""}
            </span>
            <span className="num">{r.to}</span>
            <span className={cx("num", t)}>{d === null ? "" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}`}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Raw numbers over the month, two to a row: last period → this one; coloured only for a real change, by whether it's better. */
export function NumberTrends({ rows }: { rows: MonthView["stats"] }) {
  return (
    <div className="trends2 numtrends" role="table">
      {rows.map((r) => {
        const t = r.tone ?? "flat";
        return (
          <div key={r.label} className="tr" role="row" title={`${r.title}: ${r.from ?? "—"} last period, ${r.to} this period${r.changed === "steady" ? ": no real change" : r.changed === null ? ": too few games to tell" : ""}`}>
            <span className="axis-nm one-line">{r.label}</span>
            <span className="num muted">{r.from ?? "—"}</span>
            <span className={cx("arrow", t)} aria-hidden="true">
              {r.changed === "up" ? "▲" : r.changed === "down" ? "▼" : ""}
            </span>
            <span className={cx("num", t)}>{r.to}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Champion form over the month, against your games on it before. */
export function FormTable({ rows }: { rows: MonthView["champions"] }) {
  return (
    <div className="table champform" role="table">
      <div className="thead" role="row">
        <span className="c-champ">Champion</span>
        <span className="c-num">Games</span>
        <span className="c-num">Win %</span>
        <span className="c-num" title="Win rate this month against your games on it before">
          Change
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.champion.id} className="trow" role="row">
          <span className="c-champ">
            <ChampIcon champ={r.champion} size={28} />
            <span className="nm">{r.champion.name}</span>
          </span>
          <span className="c-num">{r.games}</span>
          <span className={cx("c-num", winTone(r.winRate))}>{rate(r.winRate)}</span>
          <span className={cx("c-num", tone(r.change, 0.01))}>{r.change === null ? "new" : signedPct(r.change)}</span>
        </div>
      ))}
    </div>
  );
}

/** The monthly report's sections: summary, style trends, champions, focus targets. */
export function MonthReport({ month: m }: { month: MonthView }) {
  return (
    <div className="monthreport">
      <Section>
        <StatStrip items={m.strip} />
      </Section>
      {(m.axes.length > 0 || m.stats.length > 0) && (
        <Section title={`Your ${m.role ? `${m.role.toLowerCase()} ` : ""}style`} aside={<span className="micro" title={`${m.role ? `${m.role}: your most played role this month. ` : ""}Style axes: 50 = typical in your rank.`}>last month → this month</span>}>
          {m.stats.length > 0 && <NumberTrends rows={m.stats} />}
          {m.axes.length > 0 && <TrendTable rows={m.axes} />}
        </Section>
      )}
      {m.champions.length > 0 && (
        <Section title="Champions" aside={m.focusLine ? <span className="micro">{m.focusLine}</span> : undefined}>
          <FormTable rows={m.champions} />
        </Section>
      )}
      {(m.focus.met.length > 0 || m.focus.current) && (
        <Section title="Goals" gold={false}>
          <ul className="reasons">
            {m.focus.met.slice(0, 1).map((t) => (
              <li key={t}>{t}</li>
            ))}
            {/* The tile counts every goal met; the rest are on hover, so the two agree. */}
            {m.focus.met.length > 1 && (
              <li className="caption" title={m.focus.met.slice(1).join("\n")}>{`and ${m.focus.met.length - 1} more goal${m.focus.met.length > 2 ? "s" : ""} met`}</li>
            )}
            {m.focus.current && <li className="why">{m.focus.current}</li>}
          </ul>
        </Section>
      )}
    </div>
  );
}
