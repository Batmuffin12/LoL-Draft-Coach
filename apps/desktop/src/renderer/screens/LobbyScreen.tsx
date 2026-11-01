import { useEffect, useState } from "react";
import type { LearnView, ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { FocusCard } from "../components/FocusCard";
import { MonthReport } from "../components/MonthReport";
import { NewChampTable } from "../components/NewChampTable";
import { ChampIcon } from "../components/ChampIcon";
import { Facts } from "../components/Facts";
import { howLines, NumberRows } from "../components/StyleNumbers";
import { Pills } from "../components/Pills";
import { StyleRadar } from "../components/StyleRadar";
import { DraftTerms, ResultBand } from "../components/PostGameCard";
import { PoolCoverage, PoolLegend } from "../components/PoolCoverage";
import { Button } from "../components/Button";
import { POOL_COLUMNS, resultOverdue } from "../../shared/view";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { cx, gameCount, lobbyEmpty, needsClient, pct, positionLabel, roleName, t } from "../format";
import { useFitLevel, useFits, useNow } from "../hooks";
import { AccountFooter, Header, Notices, ProgressRow } from "./common";
import { Suggestion } from "./Suggestion";

type MainTab = "suggestion" | "last" | "me" | "champions";
type SubTab = "style" | "month" | "pool" | "new";

/** The main tabs with sub-tabs, the first one opening first. A new sub-tab is one entry here, one line in `SubScreen` and its `tabs.*` label. */
const SUB_TABS: Record<"me" | "champions", SubTab[]> = {
  me: ["style", "month"],
  champions: ["pool", "new"],
};

/** After a game the Last game tab opens first, for this long. */
const RECENT_GAME_MS = 12 * 3_600_000;

/** Out of champ select: your playstyle per role, and your pool per role with its gaps. As many roles open as fit, so nothing scrolls. */
export function LobbyScreen({ state }: { state: ViewState }) {
  return <Lobby state={state} />;
}

function Lobby({ state }: { state: ViewState }) {
  const recent = state.lastGame !== null && Date.now() - (state.lastGame.endedAt ?? state.lastGame.lockedAt) < RECENT_GAME_MS;
  const home: MainTab = recent ? "last" : "me";
  const [tab, setTab] = useState<MainTab>(home);
  const [subs, setSubs] = useState<Record<keyof typeof SUB_TABS, SubTab>>({ me: SUB_TABS.me[0]!, champions: SUB_TABS.champions[0]! });
  // A newly logged game (it arrives after the panel opens): show it first.
  const latest = state.lastGame?.lockedAt ?? 0;
  // In a lobby with roles chosen: the Next game tab appears and opens; it goes when the lobby does.
  const preview = state.queuePreview?.roles.length ? state.queuePreview : null;
  useEffect(() => {
    if (recent && !preview) setTab("last");
  }, [latest]);
  const queued = preview ? preview.roles.map((r) => r.role).join(",") : "";
  useEffect(() => {
    if (queued) setTab("suggestion");
  }, [queued]);
  const shown: MainTab = tab === "suggestion" && !preview ? home : tab;
  const group = shown === "me" || shown === "champions" ? shown : null;
  const sub = group ? subs[group] : null;
  const openSub = (g: keyof typeof SUB_TABS, value: SubTab) => {
    setSubs((now) => ({ ...now, [g]: value }));
    setTab(g);
  };
  return (
    <Window
      variant="lobby"
      header={<Header state={state} />}
      band={
        <>
          <Segmented<MainTab>
            value={shown}
            onChange={setTab}
            options={[
              ...(preview ? [{ value: "suggestion" as const, label: t("queue.tab") }] : []),
              { value: "last", label: t("tabs.last") },
              { value: "me", label: t("tabs.me") },
              { value: "champions", label: t("tabs.champions") },
            ]}
          />
          {group && sub && (
            <div className="subtabs">
              <Pills label={t(`tabs.${group}`)} options={SUB_TABS[group].map((value) => ({ value, label: t(`tabs.${value}`) }))} value={sub} onChange={(value) => openSub(group, value)} />
            </div>
          )}
        </>
      }
      footer={<AccountFooter state={state} />}
    >
      <Notices state={state} extra={state.roles.length ? null : !needsClient(state.status) ? "No champ select yet: open a lobby and the draft appears here." : shown === "last" || sub === "new" ? t("profile.openClient") : null} />
      <SessionNotice state={state} />
      {shown === "suggestion" && preview ? (
        <Suggestion state={state} preview={preview} />
      ) : sub ? (
        <SubScreen sub={sub} state={state} onNewChamps={() => openSub("champions", "new")} />
      ) : (
        <LastGame state={state} />
      )}
    </Window>
  );
}

/** What a sub-tab shows. */
function SubScreen({ sub, state, onNewChamps }: { sub: SubTab; state: ViewState; onNewChamps: () => void }) {
  if (sub === "style") return <Style state={state} />;
  if (sub === "month") return <Month state={state} />;
  if (sub === "pool") return <Pool state={state} onNewChamps={onNewChamps} />;
  return <NewChamps state={state} />;
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
 * Which role is shown: the one you chose while it still exists, else the first.
 * Each role is its own small pill, so one role shows at a time and nothing scrolls.
 */
function useRolePill(keys: string[]): [string, (key: string) => void] {
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
          <ResultBand game={g} now={now} overdue={resultOverdue(g, { pending: state.lastGamePending, gaveUp: state.lastGameGaveUp }, now)} />
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
  const [sub, setSub] = useRolePill(list.map((r) => r.role));
  // Long plans: first each row's entries go side by side, then the picks' reasons or the picks after your current champion move to hover, then the minor rows and the other picks.
  const level = useFitLevel(sub, 3);
  if (!list.length) {
    return (
      <Section title="New champions">
        <p className="caption">{state.meta?.state === "ready" ? lobbyEmpty(state.status, "new", { n: state.limits.poolGames }) : t("new.noMeta")}</p>
      </Section>
    );
  }
  const summary = (r: (typeof list)[number]) => (r.learning ? [r.learning.title, r.learning.progress].filter(Boolean).join(" · ") : r.picks.map((p) => p.champion.name).join(", "));
  return (
    <>
      <section className="section pills-row">
        <Pills compact label="Role" options={list.map((r) => ({ value: r.role, label: positionLabel(r.role), title: summary(r) }))} value={sub} onChange={setSub} />
      </section>
      {list.filter((r) => r.role === sub).map((r) => {
        const title = `New for ${positionLabel(r.role).toLowerCase()}`;
        const l = r.learning;
        return (
          <Section key={r.role} title={title} aside={<span className="micro">strong in your rank</span>}>
            {l && (
              <div className="plan learning" title={level > 2 ? minorText(l.learn) : undefined}>
                <div className="learning-head">
                  {l.champion && <ChampIcon champ={l.champion} size={28} />}
                  <span className="label gold">{l.title}</span>
                  {l.progress && <span className="micro">{l.progress}</span>}
                </div>
                <Learn learn={l.learn} level={level} />
              </div>
            )}
            {l && r.picks.length > 0 && (
              <span className="label" title={level > 1 ? [l.why, ...r.picks.map((p) => p.champion.name)].join("\n") : l.why}>
                {l.after} <span className="micro">· {l.why}</span>
              </span>
            )}
            {r.picks.length > 0 && !(l && level > 1) && (
              <div className={l ? "after-learning" : undefined}>
                <NewChampTable rows={level > 2 ? r.picks.slice(0, 1) : r.picks} brief={level > 1} />
              </div>
            )}
            {r.plan && (
              <div className="plan" title={level > 2 && r.planLearn ? [r.picks.slice(1).map((p) => p.champion.name).join(", "), minorText(r.planLearn)].filter(Boolean).join("\n") : undefined}>
                <span className="label gold">First games plan</span>
                <span>{r.plan}</span>
                {r.planLearn && <Learn learn={r.planLearn} level={level} />}
              </div>
            )}
          </Section>
        );
      })}
    </>
  );
}

/** The rows a short screen moved to hover. */
function minorText(learn: LearnView): string {
  return learn.lines
    .filter((r) => r.minor)
    .map((r) => `${r.label}: ${r.items.map((i) => i.text).join(", ")}`)
    .join("\n");
}

/** How to learn a champion: the one thing to watch next game (with your last games on it) under its stage, then short facts. */
function Learn({ learn, level }: { learn: LearnView; level: number }) {
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
      {learn.lines.length > 0 && <Facts rows={level > 2 ? learn.lines.filter((r) => !r.minor) : learn.lines} flow={level > 0} />}
    </>
  );
}

/** Your style per role: role pills, the radar against your rank, a one-line summary, then your numbers vs your rank. */
function Style({ state }: { state: ViewState }) {
  const [sub, setSub] = useRolePill(state.playstyle.map((p) => p.role));
  // Many strengths and weak spots: the note under your numbers moves to hover.
  const fits = useFits(sub);
  if (!state.playstyle.length) return <Section title="Your style"><p className="caption">{lobbyEmpty(state.status, "style", { n: state.limits.styleGames })}</p></Section>;
  const summary = (p: ViewState["playstyle"][number]) => {
    const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
    const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
    return [gameCount(p.games), high.length ? `strong: ${high.join(", ")}` : null, low.length ? `grow: ${low.join(", ")}` : null].filter(Boolean).join(" · ");
  };
  const p = state.playstyle.find((x) => x.role === sub) ?? state.playstyle[0]!;
  // How you play (pool, classes, damage) and the side split are on hover over the numbers' head.
  const how = [...(p.how ? howLines(p.how) : []), ...(state.side ? [state.side] : [])].join("\n");
  return (
    <>
      <section className="section style-top">
        <Pills
          compact
          label="Role"
          options={state.playstyle.map((x) => ({ value: x.role, label: positionLabel(x.role), title: summary(x) }))}
          value={p.role}
          onChange={setSub}
          end={`${gameCount(p.games)} · ${t("style.dashed")}`}
        />
        <StyleRadar axes={p.axes} role={roleName(p.role)} />
        {p.summary.length > 0 && <Facts rows={p.summary} flow />}
      </section>
      {p.numbers.length > 0 && (
        <Section title={t("style.numbers")} aside={<span className="micro" title={(fits ? how : [t("style.numbersNote"), how].filter(Boolean).join("\n")) || undefined}>{t("style.legend")}</span>}>
          <NumberRows items={p.numbers} />
          {fits && <span className="micro">{t("style.numbersNote")}</span>}
        </Section>
      )}
    </>
  );
}

/** The monthly report: your last 30 days against the 30 before, from your own games. */
function Month({ state }: { state: ViewState }) {
  const m = state.month;
  if (!m) return <Section title={t("tabs.month")}><p className="caption">{lobbyEmpty(state.status, "month", { n: state.limits.monthDays })}</p></Section>;
  return <MonthReport month={m} />;
}

/** Your pool per role: what each champion covers against what a team needs, then your next step. */
function Pool({ state, onNewChamps }: { state: ViewState; onNewChamps: () => void }) {
  // Roles with too few games to judge have no pool to show: left out, so the others fit.
  const list = state.roles.filter((r) => r.enoughData);
  const [sub, setSub] = useRolePill(list.map((r) => r.role));
  // A big pool: first the extra champions' names move to hover, then the legend and the note under what's missing.
  const level = useFitLevel(sub, 2);
  if (!list.length) return <Section title="Your pool"><p className="caption">{lobbyEmpty(state.status, "pool", { n: state.limits.poolGames })}</p></Section>;
  const stats = (r: ViewState["roles"][number]) => `${gameCount(r.games)} · ${pct(r.winRate)} WR`;
  const r = list.find((x) => x.role === sub) ?? list[0]!;
  const columns = r.pool.slice(0, POOL_COLUMNS);
  const next = r.nextStep;
  return (
    <>
      <section className="section">
        <Pills
          compact
          label="Role"
          options={list.map((x) => ({ value: x.role, label: positionLabel(x.role), title: [stats(x), x.pool.slice(0, 3).map((c) => c.champion.name).join(", ")].filter(Boolean).join(" · ") }))}
          value={r.role}
          onChange={setSub}
          end={stats(r)}
        />
        {columns.length > 0 && r.coverage ? (
          <>
            <PoolCoverage pool={columns} coverage={r.coverage} />
            {r.also.length > 0 && <Facts rows={r.also} iconOnly={level > 0} wide />}
            {level < 2 && <PoolLegend />}
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
              <Facts rows={[next.adds]} flow />
            </span>
          </div>
        )}
        {r.missing ? (
          <div className="missing">
            <span className="who" title={r.missing.note}>
              <Facts rows={[r.missing.row]} flow />
              {level < 2 && <span className="micro">{r.missing.note}</span>}
            </span>
            <Button onClick={onNewChamps}>{t("pool.seeNew")}</Button>
          </div>
        ) : (
          !next && <span className="caption">{r.noGaps}</span>
        )}
      </Section>
    </>
  );
}
