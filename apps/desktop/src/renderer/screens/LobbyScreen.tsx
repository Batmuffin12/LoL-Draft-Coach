import { useState } from "react";
import type { ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { PlaystyleAxis } from "../components/PlaystyleAxis";
import { PoolChip } from "../components/PoolChip";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { pct, positionLabel } from "../format";
import { AccountFooter, Header, Notices } from "./common";

type LobbyTab = "style" | "pool";

/** Out of champ select: your playstyle per role, and your pool per role with its gaps. */
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

function Style({ state }: { state: ViewState }) {
  if (!state.playstyle.length) return <Section title="Your style">{<p className="caption">Your style per role shows here once your recent games are loaded.</p>}</Section>;
  return (
    <>
      {state.playstyle.map((p) => (
        <Section key={p.role} title={positionLabel(p.role)} aside={<span className="micro">50 = typical</span>}>
          {p.axes.map((a) => (
            <PlaystyleAxis key={a.axis} axis={a} showDetail={a.level !== "mid"} />
          ))}
          <span className="micro">
            Your last {p.games} {p.role} games against the other {p.role} players in them.
          </span>
        </Section>
      ))}
    </>
  );
}

function Pool({ state }: { state: ViewState }) {
  if (!state.roles.length) return <Section title="Your pool">{<p className="caption">Your roles and pool show here once your recent games are loaded.</p>}</Section>;
  return (
    <>
      {state.roles.map((r, i) => (
        <Section key={r.role} title={`${positionLabel(r.role)} pool`} gold={i === 0} aside={<span className="micro">{`${r.games} game${r.games === 1 ? "" : "s"} · ${pct(r.winRate)}`}</span>}>
          {r.enoughData ? (
            <>
              {r.pool.map((c) => (
                <PoolChip key={c.champion.id} entry={c} />
              ))}
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
      ))}
      <Section>
        <span className="micro">Roles ranked by your recent results. Information only: you choose your positions.</span>
      </Section>
    </>
  );
}
