import { useEffect, useLayoutEffect, useState } from "react";
import type { LearnView, ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { FocusCard } from "../components/FocusCard";
import { MonthReport } from "../components/MonthReport";
import { NewChampTable } from "../components/NewChampTable";
import { Button } from "../components/Button";
import { ChampIcon } from "../components/ChampIcon";
import { PlaystyleAxis } from "../components/PlaystyleAxis";
import { PostGameCard } from "../components/PostGameCard";
import { PoolTable } from "../components/PoolTable";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { cx, pct, positionLabel, roleName } from "../format";
import { useNow } from "../hooks";
import { AccountFooter, Header, Notices } from "./common";

type LobbyTab = "last" | "style" | "pool" | "new";

/** After a game the Last game tab opens first, for this long. */
const RECENT_GAME_MS = 12 * 3_600_000;

/** Out of champ select: your playstyle per role, and your pool per role with its gaps. As many roles open as fit, so nothing scrolls. */
export function LobbyScreen({ state }: { state: ViewState }) {
  return <Lobby state={state} />;
}

/** The monthly report, opened from the Style tab; Back returns to the lobby. */
function MonthScreen({ state, onBack }: { state: ViewState; onBack: () => void }) {
  const m = state.month!;
  return (
    <Window
      header={<Header state={state} />}
      band={
        <div className="you">
          <div className="who">
            <span className="label gold">{`Monthly report · ${m.period}`}</span>
            <span className="nm">Your month</span>
          </div>
          <Button variant="ghost" small onClick={onBack}>
            Back
          </Button>
        </div>
      }
      footer={<span className="micro one-line">{m.footer}</span>}
    >
      <MonthReport month={m} />
    </Window>
  );
}

function Lobby({ state }: { state: ViewState }) {
  const recent = state.lastGame !== null && Date.now() - (state.lastGame.endedAt ?? state.lastGame.lockedAt) < RECENT_GAME_MS;
  const [tab, setTab] = useState<LobbyTab>(recent ? "last" : "style");
  const [showMonth, setShowMonth] = useState(false);
  // A newly logged game (it arrives after the panel opens): show it first.
  const latest = state.lastGame?.lockedAt ?? 0;
  useEffect(() => {
    if (recent) setTab("last");
  }, [latest]);
  if (showMonth && state.month) return <MonthScreen state={state} onBack={() => setShowMonth(false)} />;
  return (
    <Window
      header={<Header state={state} />}
      band={
        <Segmented<LobbyTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "last", label: "Last game" },
            { value: "style", label: "Style" },
            { value: "pool", label: "Pool" },
            { value: "new", label: "New" },
          ]}
        />
      }
      footer={<AccountFooter account={state.account} />}
    >
      <Notices state={state} extra={state.roles.length ? null : "No champ select yet: open a lobby and the draft appears here."} />
      <SessionNotice state={state} />
      {tab === "last" ? <LastGame state={state} /> : tab === "style" ? <Style state={state} onMonth={() => setShowMonth(true)} /> : tab === "pool" ? <Pool state={state} /> : <NewChamps state={state} />}
    </Window>
  );
}

/** A break suggestion after a losing streak or a long session, until the session is over. */
function SessionNotice({ state }: { state: ViewState }) {
  const now = useNow(60_000);
  const s = state.session;
  if (!s || now > s.until) return null;
  return (
    <div className="notices">
      <Notice tone="info">
        {s.text}
        {s.record && <span className="caption block">{s.record}</span>}
      </Notice>
    </div>
  );
}

/**
 * Which roles are open: the one you chose first, then as many of the others (in order) as fit
 * without scrolling; the rest show as one-line heads. `dataKey` changes when the roles do.
 */
function useOpenRoles(count: number, dataKey: string): { isOpen: (i: number) => boolean; open: (i: number) => void } {
  const [st, setSt] = useState({ first: 0, fit: count, key: dataKey });
  if (st.key !== dataKey) setSt({ first: st.first < count ? st.first : 0, fit: count, key: dataKey });
  // Before paint: close the last open role while the scrolling area overflows.
  useLayoutEffect(() => {
    const el = document.querySelector(".window .scroll");
    if (el && el.scrollHeight > el.clientHeight && st.fit > 1) setSt((x) => ({ ...x, fit: x.fit - 1 }));
  });
  const order = [st.first, ...Array.from({ length: count }, (_, i) => i).filter((i) => i !== st.first)];
  const openSet = new Set(order.slice(0, st.fit));
  return { isOpen: (i) => openSet.has(i), open: (i) => setSt({ first: i, fit: count, key: dataKey }) };
}

/** A closed role: its head with a one-line summary; click to open it. */
function ClosedRole({ title, summary, onOpen }: { title: string; summary: string; onOpen: () => void }) {
  return (
    <section className="section">
      <button type="button" className="section-head closed" onClick={onOpen} aria-expanded={false} title={summary}>
        <span className="label">{title}</span>
        <span className="rule" aria-hidden="true" />
        <span className="micro one-line">{summary}</span>
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </button>
    </section>
  );
}

/** Your last game against the advice the coach gave (the advice log). */
function LastGame({ state }: { state: ViewState }) {
  const now = useNow(60_000);
  return (
    <>
      <Section title="Last game">
        {state.lastGame ? (
          <PostGameCard game={state.lastGame} now={now} />
        ) : (
          <p className="caption">After your next game, how it went against the advice you were shown appears here: your pick, the suggestions, the result and what mattered most in the draft.</p>
        )}
      </Section>
      {state.focus && (
        <Section title="Your goal">
          <FocusCard focus={state.focus} />
        </Section>
      )}
    </>
  );
}

/** New champions per role: meta in your rank, like what you play well; one role open per fit, first-games plan under the table. */
function NewChamps({ state }: { state: ViewState }) {
  const list = state.newChamps.filter((r) => r.picks.length || r.learning);
  const roles = useOpenRoles(list.length, list.map((r) => `${r.role}:${r.picks.map((p) => p.champion.id).join("-")}`).join());
  if (!list.length) {
    return (
      <Section title="New champions">
        <p className="caption">New champions to learn show here once the live meta for your rank is loaded and your pool for a role is known.</p>
      </Section>
    );
  }
  return (
    <>
      {list.map((r, i) => {
        const title = `New for ${positionLabel(r.role).toLowerCase()}`;
        const summary = r.learning ? [r.learning.title, r.learning.progress].filter(Boolean).join(" · ") : r.picks.map((p) => p.champion.name).join(", ");
        if (!roles.isOpen(i)) return <ClosedRole key={r.role} title={title} summary={summary} onOpen={() => roles.open(i)} />;
        const l = r.learning;
        return (
          <Section key={r.role} title={title} gold={i === 0} aside={<span className="micro">strong in your rank</span>}>
            {l && (
              <div className="plan learning">
                <div className="learning-head">
                  {l.champion && <ChampIcon champ={l.champion} size={28} />}
                  <span className="label gold">{l.title}</span>
                  {l.progress && <span className="micro">{l.progress}</span>}
                </div>
                <Learn learn={l.learn} />
              </div>
            )}
            {l && r.picks.length > 0 && (
              <span className="label" title={l.why}>
                {l.after} <span className="micro">· {l.why}</span>
              </span>
            )}
            {r.picks.length > 0 && (
              <div className={l ? "after-learning" : undefined}>
                <NewChampTable rows={r.picks} />
              </div>
            )}
            {r.plan && (
              <div className="plan">
                <span className="label gold">First games plan</span>
                <span>{r.plan}</span>
                {r.planLearn && <Learn learn={r.planLearn} />}
              </div>
            )}
          </Section>
        );
      })}
    </>
  );
}

/** How to learn a champion: the one thing to watch next game (with your last games on it) under its stage, then short facts. */
function Learn({ learn }: { learn: LearnView }) {
  const f = learn.focus;
  return (
    <>
      {f ? (
        <div className="learn-focus" title="Filled: you reached it in that game on this champion">
          <span className="label gold">{learn.stage ? `This game · ${learn.stage}` : "This game"}</span>
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
      {learn.lines.length > 0 && <Lines lines={learn.lines} />}
    </>
  );
}

/** Short facts, one per line. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="notes">
      {lines.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Style({ state, onMonth }: { state: ViewState; onMonth: () => void }) {
  const roles = useOpenRoles(state.playstyle.length, state.playstyle.map((p) => `${p.role}:${p.games}`).join());
  if (!state.playstyle.length) return <Section title="Your style">{<p className="caption">Your style per role shows here once your recent games are loaded.</p>}</Section>;
  return (
    <>
      {state.playstyle.map((p, i) => {
        if (!roles.isOpen(i)) {
          const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
          const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
          const summary = [`${p.games} games`, high.length ? `strong: ${high.join(", ")}` : null, low.length ? `grow: ${low.join(", ")}` : null].filter(Boolean).join(" · ");
          return <ClosedRole key={p.role} title={positionLabel(p.role)} summary={summary} onOpen={() => roles.open(i)} />;
        }
        return (
          <Section key={p.role} title={positionLabel(p.role)} aside={<span className="micro">50 = typical in your rank</span>}>
            {p.axes.map((a) => (
              <PlaystyleAxis key={a.axis} axis={a} showDetail={a.level !== "mid"} />
            ))}
            <span className="micro">
              From your last {p.games} {roleName(p.role)} games.
            </span>
          </Section>
        );
      })}
      {state.month && (
        <ClosedRole
          title="This month"
          summary={[`${state.month.games} games`, ...state.month.strip.slice(1, 3).map((t) => `${t.label} ${t.value}`)].join(" · ")}
          onOpen={onMonth}
        />
      )}
    </>
  );
}

function Pool({ state }: { state: ViewState }) {
  // Roles with too few games to judge have no pool to show: left out, so the others fit.
  const list = state.roles.filter((r) => r.enoughData);
  const roles = useOpenRoles(list.length, list.map((r) => `${r.role}:${r.games}`).join());
  if (!list.length) return <Section title="Your pool">{<p className="caption">Your roles and pool show here once your recent games are loaded.</p>}</Section>;
  const stats = (r: ViewState["roles"][number]) => `${r.games} game${r.games === 1 ? "" : "s"} · ${pct(r.winRate)} WR`;
  return (
    <>
      {list.map((r, i) =>
        !roles.isOpen(i) ? (
          <ClosedRole
            key={r.role}
            title={`${positionLabel(r.role)} pool`}
            summary={[stats(r), r.pool.slice(0, 3).map((c) => c.champion.name).join(", ")].filter(Boolean).join(" · ")}
            onOpen={() => roles.open(i)}
          />
        ) : (
          <Section key={r.role} title={`${positionLabel(r.role)} pool`} gold={i === 0} aside={<span className="micro" title="Roles ranked by your recent results. Information only: you choose your positions.">{stats(r)}</span>}>
            {r.enoughData ? (
              <>
                {r.pool.length > 0 && <PoolTable rows={r.pool} />}
                {r.holes.map((h) => (
                  // The evidence (how often your team lacked it in your losses) is on hover, so the pool fits.
                  <span key={h.text} title={h.evidence ?? undefined}>
                    <Notice>
                      <strong>{h.text}</strong>
                      {h.coveredBy ? ` · ${h.coveredBy}` : ""}
                    </Notice>
                  </span>
                ))}
              </>
            ) : (
              <p className="caption">Not enough games to judge.</p>
            )}
          </Section>
        ),
      )}
    </>
  );
}
