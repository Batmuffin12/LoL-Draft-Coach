import { useEffect, useState } from "react";
import type { FactorName } from "@ldc/shared";
import type { ChampView, DraftView, PickView, SlotView, ViewState } from "../shared/view";

const TIMER_PHASE_LABEL: Record<string, string> = {
  PLANNING: "Declare your pick",
  BAN_PICK: "Draft",
  FINALIZATION: "Finalization",
  GAME_STARTING: "Game starting",
};

const FACTOR_LABEL: Record<FactorName, string> = {
  comfort: "Comfort",
  teamNeeds: "Team needs",
  laneMatchup: "Matchup",
  counterValue: "Counter",
  metaStrength: "Meta",
};

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Icon({ champ, size = 32, dim = false }: { champ: ChampView | null; size?: number; dim?: boolean }) {
  if (!champ) return <div className="icon empty" style={{ width: size, height: size }} />;
  return champ.iconUrl ? (
    <img className={`icon${dim ? " dim" : ""}`} src={champ.iconUrl} width={size} height={size} alt={champ.name} title={champ.name} />
  ) : (
    <div className="icon empty" style={{ width: size, height: size }} title={champ.name} />
  );
}

function Slot({ slot }: { slot: SlotView }) {
  const shown = slot.champion ?? slot.hover;
  return (
    <li className={`slot${slot.isLocalPlayer ? " me" : ""}${slot.actingType ? " acting" : ""}`}>
      <Icon champ={shown} dim={!slot.champion && !!slot.hover} />
      <div className="slot-text">
        <span className="champ-name">{shown ? shown.name : slot.actingType === "ban" ? "Banning…" : slot.actingType ? "Picking…" : "—"}</span>
        <span className="pos">
          {slot.isLocalPlayer ? "You" : ""}
          {slot.isLocalPlayer && slot.position ? " · " : ""}
          {slot.position}
          {!slot.champion && slot.hover ? " (hover)" : ""}
        </span>
      </div>
    </li>
  );
}

function Bans({ bans }: { bans: ChampView[] }) {
  return (
    <div className="bans">
      {bans.map((b, i) => (
        <Icon key={`${b.id}-${i}`} champ={b} size={22} />
      ))}
    </div>
  );
}

function Timer({ draft }: { draft: DraftView }) {
  const now = useNow(250);
  const left = Math.max(0, draft.timeLeftMs - (now - draft.receivedAt));
  return <span className="timer">{Math.ceil(left / 1000)}s</span>;
}

function Picks({ picks, role, state }: { picks: PickView[]; role: string | null; state: ViewState }) {
  const profile = state.status.profile;
  return (
    <section className="card picks">
      <h2>
        Suggested picks{role ? <span className="muted"> · {role}</span> : null}
      </h2>
      {profile.state === "loading" && (
        <p className="muted">
          Loading your match history… {profile.done}/{profile.total}
        </p>
      )}
      {profile.state === "error" && <p className="warn">{profile.message}</p>}
      {picks.length === 0 && profile.state !== "loading" && <p className="muted">Suggestions appear during champ select.</p>}
      <ol>
        {picks.map((p, i) => (
          <li key={p.champion.id} className="pick">
            <span className="rank">{i + 1}</span>
            <Icon champ={p.champion} size={40} />
            <div className="pick-body">
              <div className="pick-head">
                <strong>{p.champion.name}</strong>
                <span className="score">{Math.round(p.score * 100)}</span>
              </div>
              <div className="factors">
                {(Object.keys(p.factors) as FactorName[])
                  .filter((k) => p.factors[k] !== null)
                  .map((k) => (
                    <div key={k} className="factor" title={`${FACTOR_LABEL[k]}: ${Math.round((p.factors[k] ?? 0) * 100)}`}>
                      <span>{FACTOR_LABEL[k]}</span>
                      <div className="bar">
                        <div style={{ width: `${Math.round((p.factors[k] ?? 0) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
              </div>
              <ul className="reasons">
                {p.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <p className="disclaimer">Suggestions only — you choose and lock your champion.</p>
    </section>
  );
}

export function App() {
  const [state, setState] = useState<ViewState | null>(null);
  useEffect(() => window.coach.onState(setState), []);

  if (!state) return <div className="app loading">Starting…</div>;
  const { status, draft } = state;
  const lcuLabel = { searching: "Waiting for League client", connected: "Connected", disconnected: "Client closed" }[status.lcu];

  return (
    <div className="app">
      <header className="titlebar">
        <span className={`dot ${status.lcu}`} title={lcuLabel} />
        <span className="title">Draft Coach</span>
        <span className="muted small">{status.patch ? `Patch ${status.patch}` : ""}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => window.coach.setDocked(!state.docked)} title="Dock next to the League client">
          {state.docked ? "Docked" : "Undocked"}
        </button>
        <button className="btn close" onClick={() => window.coach.close()} title="Close">
          ×
        </button>
      </header>

      <main>
        <div className="status-line">
          <span>{lcuLabel}</span>
          {status.gameflowPhase && <span className="muted"> · {status.gameflowPhase}</span>}
          {status.band !== null && <span className="muted"> · band {status.band}</span>}
        </div>

        {state.notices.map((n) => (
          <p key={n} className="warn small">
            {n}
          </p>
        ))}

        {draft ? (
          <>
            <section className="card phase">
              <span>{TIMER_PHASE_LABEL[draft.timerPhase] ?? draft.timerPhase}</span>
              {draft.localAction && <span className="your-turn">Your {draft.localAction}!</span>}
              <Timer draft={draft} />
            </section>

            <Picks picks={state.picks} role={state.pickRole} state={state} />

            <section className="card teams">
              <div>
                <h3>Your team</h3>
                <Bans bans={draft.myBans} />
                <ul className="slots">{draft.myTeam.map((s) => <Slot key={s.cellId} slot={s} />)}</ul>
              </div>
              <div>
                <h3>Enemy team</h3>
                <Bans bans={draft.theirBans} />
                <ul className="slots">{draft.theirTeam.map((s) => <Slot key={s.cellId} slot={s} />)}</ul>
              </div>
            </section>
          </>
        ) : (
          <section className="card idle">
            <p>No champ select in progress.</p>
            <p className="muted small">Open a lobby (a custom draft lobby works) and the draft will show up here live.</p>
            {state.status.profile.state !== "idle" && <Picks picks={[]} role={state.pickRole} state={state} />}
          </section>
        )}
      </main>
    </div>
  );
}
