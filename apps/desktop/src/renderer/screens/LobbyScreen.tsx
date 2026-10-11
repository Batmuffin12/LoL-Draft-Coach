import { useEffect, useState } from "react";
import type { LearnView, ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { FocusCard } from "../components/FocusCard";
import { MonthReport } from "../components/MonthReport";
import { NewChampTable } from "../components/NewChampTable";
import { ChampIcon } from "../components/ChampIcon";
import { howLines, NumberRows } from "../components/StyleNumbers";
import { Pills } from "../components/Pills";
import { StyleRadar } from "../components/StyleRadar";
import { DraftTerms, ResultBand } from "../components/PostGameCard";
import { PoolCoverage, PoolLegend } from "../components/PoolCoverage";
import { Button } from "../components/Button";
import { POOL_COLUMNS } from "../../shared/view";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { cx, pct, positionLabel, roleName, t } from "../format";
import { useNow } from "../hooks";
import { AccountFooter, Header, Notices, ProgressRow } from "./common";

type LobbyTab = "last" | "style" | "pool" | "new" | "month";

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
      variant="lobby"
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
            { value: "month", label: "This month" },
          ]}
        />
      }
      footer={<AccountFooter account={state.account} />}
    >
      <Notices state={state} extra={state.roles.length ? null : "No champ select yet: open a lobby and the draft appears here."} />
      <SessionNotice state={state} />
      {tab === "last" ? (
        <LastGame state={state} />
      ) : tab === "style" ? (
        <Style state={state} />
      ) : tab === "pool" ? (
        <Pool state={state} onNewChamps={() => setTab("new")} />
      ) : tab === "new" ? (
        <NewChamps state={state} />
      ) : (
        <Month state={state} />
      )}
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

/** Your last game against the advice the coach gave (the advice log). */
function LastGame({ state }: { state: ViewState }) {
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
          <ResultBand game={g} now={now} />
          {(g.terms.length > 0 || g.lines.length > 0) && (
            <Section title={t("last.decided")}>
              <DraftTerms game={g} />
            </Section>
          )}
        </>
      ) : (
        <Section title="Last game">
          <p className="caption">After your next game, how it went against the advice you were shown appears here: your pick, the suggestions, the result and what mattered most in the draft.</p>
        </Section>
      )}
      {state.focus && (
        <Section title={t("last.goal")} aside={<span className="micro">{state.focus.on}</span>}>
          <FocusCard focus={state.focus} game={g?.focus ?? null} />
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
      <section className="section pills-row">
        <Pills label="Role" options={list.map((r) => ({ value: r.role, label: positionLabel(r.role), title: summary(r) }))} value={sub} onChange={setSub} />
      </section>
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

/** Your style per role: role pills, the radar against your rank, a one-line summary, then your numbers vs your rank. */
function Style({ state }: { state: ViewState }) {
  const [sub, setSub] = useSubTab(state.playstyle.map((p) => p.role));
  if (!state.playstyle.length) return <Section title="Your style">{<p className="caption">Your style per role shows here once your recent games are loaded.</p>}</Section>;
  const summary = (p: ViewState["playstyle"][number]) => {
    const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
    const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
    return [`${p.games} games`, high.length ? `strong: ${high.join(", ")}` : null, low.length ? `grow: ${low.join(", ")}` : null].filter(Boolean).join(" · ");
  };
  const p = state.playstyle.find((x) => x.role === sub) ?? state.playstyle[0]!;
  // How you play (pool, classes, damage) and the side split are on hover over the numbers' head.
  const how = [...(p.how ? howLines(p.how) : []), ...(state.side ? [state.side] : [])].join("\n");
  return (
    <>
      <section className="section style-top">
        <Pills
          label="Role"
          options={state.playstyle.map((x) => ({ value: x.role, label: positionLabel(x.role), title: summary(x) }))}
          value={p.role}
          onChange={setSub}
          end={`${p.games} ${p.games === 1 ? "game" : "games"} · ${t("style.dashed")}`}
        />
        <StyleRadar axes={p.axes} role={roleName(p.role)} />
        {p.summary && <span className="caption text">{p.summary}</span>}
      </section>
      {p.numbers.length > 0 && (
        <Section title={t("style.numbers")} aside={<span className="micro" title={how || undefined}>{t("style.legend")}</span>}>
          <NumberRows items={p.numbers} />
          <span className="micro">{t("style.numbersNote")}</span>
        </Section>
      )}
    </>
  );
}

/** The monthly report: your last 30 days against the 30 before, from your own games. */
function Month({ state }: { state: ViewState }) {
  const m = state.month;
  if (!m) return <Section title="This month">{<p className="caption">Your month shows here once your recent games are loaded.</p>}</Section>;
  return <MonthReport month={m} />;
}

/** Your pool per role: what each champion covers against what a team needs, then your next step. */
function Pool({ state, onNewChamps }: { state: ViewState; onNewChamps: () => void }) {
  // Roles with too few games to judge have no pool to show: left out, so the others fit.
  const list = state.roles.filter((r) => r.enoughData);
  const [sub, setSub] = useSubTab(list.map((r) => r.role));
  if (!list.length) return <Section title="Your pool">{<p className="caption">Your roles and pool show here once your recent games are loaded.</p>}</Section>;
  const stats = (r: ViewState["roles"][number]) => `${r.games} ${r.games === 1 ? "game" : "games"} · ${pct(r.winRate)} WR`;
  const r = list.find((x) => x.role === sub) ?? list[0]!;
  const columns = r.pool.slice(0, POOL_COLUMNS);
  const next = r.nextStep;
  return (
    <>
      <section className="section">
        <Pills
          label="Role"
          options={list.map((x) => ({ value: x.role, label: positionLabel(x.role), title: [stats(x), x.pool.slice(0, 3).map((c) => c.champion.name).join(", ")].filter(Boolean).join(" · ") }))}
          value={r.role}
          onChange={setSub}
          end={stats(r)}
        />
        {columns.length > 0 && r.coverage ? (
          <>
            <PoolCoverage pool={columns} coverage={r.coverage} />
            {r.also && <span className="micro">{r.also}</span>}
            <PoolLegend />
          </>
        ) : (
          <p className="caption">No champions in your {roleName(r.role)} pool yet.</p>
        )}
      </section>
      <Section title={t("pool.next")}>
        {next && (
          <div className="you next-step" title={next.evidence ?? undefined}>
            <ChampIcon champ={next.champion} size={34} />
            <span className="who">
              <span className="t-heading gold-bright">{next.title}</span>
              <span className="caption text">{next.text}</span>
            </span>
          </div>
        )}
        {r.missing ? (
          <div className="missing">
            <span className="caption">{r.missing}</span>
            <Button onClick={onNewChamps}>{t("pool.seeNew")}</Button>
          </div>
        ) : (
          !next && <span className="caption">{r.noGaps}</span>
        )}
      </Section>
    </>
  );
}
