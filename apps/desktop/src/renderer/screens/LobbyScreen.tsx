import { useState } from "react";
import type { ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { PlaystyleAxis } from "../components/PlaystyleAxis";
import { PoolTable } from "../components/PoolTable";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { pct, positionLabel } from "../format";
import { AccountFooter, Header, Notices } from "./common";

type LobbyTab = "style" | "pool";

/** Out of champ select: your playstyle per role, and your pool per role with its gaps. One role open at a time, so nothing scrolls. */
export function LobbyScreen({ state }: { state: ViewState }) {
  const [tab, setTab] = useState<LobbyTab>("style");
  return (
    <Window
      header={<Header state={state} />}
      band={
        <Segmented<LobbyTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "style", label: "Your style" },
            { value: "pool", label: "Your pool" },
          ]}
        />
      }
      footer={<AccountFooter account={state.account} />}
    >
      <Notices state={state} extra="No champ select in progress. Open a lobby (a custom draft lobby works) and the draft shows up here live." />
      {tab === "style" ? <Style state={state} /> : <Pool state={state} />}
    </Window>
  );
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

function Style({ state }: { state: ViewState }) {
  const [open, setOpen] = useState(0);
  if (!state.playstyle.length) return <Section title="Your style">{<p className="caption">Your style per role shows here once your recent games are loaded.</p>}</Section>;
  return (
    <>
      {state.playstyle.map((p, i) => {
        if (i !== open) {
          const high = p.axes.filter((a) => a.level === "high").map((a) => a.label);
          const low = p.axes.filter((a) => a.level === "low").map((a) => a.label);
          const summary = [`${p.games} games`, high.length ? `strong: ${high.join(", ")}` : null, low.length ? `grow: ${low.join(", ")}` : null].filter(Boolean).join(" · ");
          return <ClosedRole key={p.role} title={positionLabel(p.role)} summary={summary} onOpen={() => setOpen(i)} />;
        }
        return (
          <Section key={p.role} title={positionLabel(p.role)} aside={<span className="micro">50 = typical</span>}>
            {p.axes.map((a) => (
              <PlaystyleAxis key={a.axis} axis={a} showDetail={a.level !== "mid"} />
            ))}
            <span className="micro">
              Your last {p.games} {p.role} games against the other {p.role} players in them.
            </span>
          </Section>
        );
      })}
    </>
  );
}

function Pool({ state }: { state: ViewState }) {
  const [open, setOpen] = useState(0);
  if (!state.roles.length) return <Section title="Your pool">{<p className="caption">Your roles and pool show here once your recent games are loaded.</p>}</Section>;
  const stats = (r: ViewState["roles"][number]) => `${r.games} game${r.games === 1 ? "" : "s"} · ${pct(r.winRate)}`;
  return (
    <>
      {state.roles.map((r, i) =>
        i !== open ? (
          <ClosedRole
            key={r.role}
            title={`${positionLabel(r.role)} pool`}
            summary={[stats(r), r.pool.slice(0, 3).map((c) => c.champion.name).join(", ")].filter(Boolean).join(" · ")}
            onOpen={() => setOpen(i)}
          />
        ) : (
          <Section key={r.role} title={`${positionLabel(r.role)} pool`} gold={i === 0} aside={<span className="micro">{stats(r)}</span>}>
            {r.enoughData ? (
              <>
                {r.pool.length > 0 && <PoolTable rows={r.pool} />}
                {r.holes.map((h) => (
                  <Notice key={h.text}>
                    <strong>{h.text}</strong>
                    {h.evidence ? `. ${h.evidence}` : ""}
                    {h.coveredBy ? `. ${h.coveredBy}.` : ""}
                  </Notice>
                ))}
              </>
            ) : (
              <p className="caption">Not enough games to judge.</p>
            )}
          </Section>
        ),
      )}
      <Section>
        <span className="micro">Roles ranked by your recent results. Information only: you choose your positions.</span>
      </Section>
    </>
  );
}
