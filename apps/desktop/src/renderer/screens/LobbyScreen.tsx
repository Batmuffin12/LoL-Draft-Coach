import { useEffect, useState } from "react";
import type { LearnView, ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { FocusCard } from "../components/FocusCard";
import { MonthReport } from "../components/MonthReport";
import { NewChampTable } from "../components/NewChampTable";
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

function Lobby({ state }: { state: ViewState }) {
  const recent = state.lastGame !== null && Date.now() - (state.lastGame.endedAt ?? state.lastGame.lockedAt) < RECENT_GAME_MS;
  const [tab, setTab] = useState<LobbyTab>(recent ? "last" : "style");
  // A newly logged game (it arrives after the panel opens): show it first.
  const latest = state.lastGame?.lockedAt ?? 0;
  useEffect(() => {
    if (recent) setTab("last");
  }, [latest]);
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
      {tab === "last" ? <LastGame state={state} /> : tab === "style" ? <Style state={state} /> : tab === "pool" ? <Pool state={state} /> : <NewChamps state={state} />}
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
 * Which sub-tab (a role, or This month) is shown: the one you chose while it still exists, else the first.
 * Each role is its own small tab under the main one, so one role shows at a time and nothing scrolls.
 */
function useSubTab(keys: string[]): [string, (key: string) => void] {
  const [chosen, setChosen] = useState(keys[0] ?? "");
  return [keys.includes(chosen) ? chosen : (keys[0] ?? ""), setChosen];
}

/** The small tab row under a main tab; a tab's hover gives its one-line summary. */
function SubTabs({ options, value, onChange }: { options: { value: string; label: string; title?: string }[]; value: string; onChange: (v: string) => void }) {
  return options.length > 1 ? <Segmented sub options={options} value={value} onChange={onChange} /> : null;
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

/** New champions per role (a sub-tab each): meta in your rank, like what you play well; first-games plan under the table. */
function NewChamps({ state }: { state: ViewState }) {
  const list = state.newChamps.filter((r) => r.picks.length || r.learning);
  const [sub, setSub] = useSubTab(list.map((r) => r.role));
  if (!list.length) {
    return (
      <Section title="New champions">
        <p className="caption">New champions to learn show here once the live meta for your rank is loaded and your pool for a role is known.</p>
      </Section>
    );
  }
  const summary = (r: (typeof list)[number]) => (r.learning ? [r.learning.title, r.learning.progress].filter(Boolean).join(" · ") : r.picks.map((p) => p.champion.name).join(", "));
  return (
    <>
      <SubTabs options={list.map((r) => ({ value: r.role, label: positionLabel(r.role), title: summary(r) }))} value={sub} onChange={setSub} />
      {list.filter((r) => r.role === sub).map((r) => {
        const title = `New for ${positionLabel(r.role).toLowerCase()}`;
        const l = r.learning;
        return (
          <Section key={r.role} title={title} aside={<span className="micro">strong in your rank</span>}>
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

/** Your style per role, and the monthly report, each a sub-tab. */
function Style({ state }: { state: ViewState }) {
  const MONTH = "month";
  const [sub, setSub] = useSubTab([...state.playstyle.map((p) => p.role), ...(state.month ? [MONTH] : [])]);
  if (!state.playstyle.length && !state.month) return <Section title="Your style">{<p className="caption">Your style per role shows here once your recent games are loaded.</p>}</Section>;
  const summary = (p: ViewState["playstyle"][number]) => {
    const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
    const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
    return [`${p.games} games`, high.length ? `strong: ${high.join(", ")}` : null, low.length ? `grow: ${low.join(", ")}` : null].filter(Boolean).join(" · ");
  };
  const m = state.month;
  return (
    <>
      <SubTabs
        options={[
          ...state.playstyle.map((p) => ({ value: p.role, label: positionLabel(p.role), title: summary(p) })),
          ...(m ? [{ value: MONTH, label: "This month", title: [`${m.games} games`, ...m.strip.slice(1, 3).map((t) => `${t.label} ${t.value}`)].join(" · ") }] : []),
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === MONTH && m ? (
        <>
          <div className="section">
            <span className="micro">{`${m.period} · ${m.footer}`}</span>
          </div>
          <MonthReport month={m} />
        </>
      ) : (
        state.playstyle
          .filter((p) => p.role === sub)
          .map((p) => (
            <Section key={p.role} title={`Your ${roleName(p.role)} style`} aside={<span className="micro">50 = typical in your rank</span>}>
              {p.axes.map((a) => (
                <PlaystyleAxis key={a.axis} axis={a} showDetail={a.level !== "mid"} />
              ))}
              <span className="micro">
                From your last {p.games} {roleName(p.role)} games.
              </span>
            </Section>
          ))
      )}
    </>
  );
}

function Pool({ state }: { state: ViewState }) {
  // Roles with too few games to judge have no pool to show: left out, so the others fit.
  const list = state.roles.filter((r) => r.enoughData);
  const [sub, setSub] = useSubTab(list.map((r) => r.role));
  if (!list.length) return <Section title="Your pool">{<p className="caption">Your roles and pool show here once your recent games are loaded.</p>}</Section>;
  const stats = (r: ViewState["roles"][number]) => `${r.games} game${r.games === 1 ? "" : "s"} · ${pct(r.winRate)} WR`;
  return (
    <>
      <SubTabs
        options={list.map((r) => ({ value: r.role, label: positionLabel(r.role), title: [stats(r), r.pool.slice(0, 3).map((c) => c.champion.name).join(", ")].filter(Boolean).join(" · ") }))}
        value={sub}
        onChange={setSub}
      />
      {list
        .filter((r) => r.role === sub)
        .map((r) => (
          <Section key={r.role} title={`${positionLabel(r.role)} pool`} aside={<span className="micro" title="Roles ranked by your recent results. Information only: you choose your positions.">{stats(r)}</span>}>
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
        ))}
    </>
  );
}
