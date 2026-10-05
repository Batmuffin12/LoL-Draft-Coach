import { useEffect, useState } from "react";
import type { FactorName } from "@ldc/shared";
import type { AccountView, ChampView, DraftView, PickView, RoleView, SlotView, ViewState } from "../shared/view";

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
      {picks.length === 0 && (profile.state === "ready" || profile.state === "idle") && (
        <p className="muted">Suggestions appear during champ select.</p>
      )}
      <ol>
        {picks.map((p, i) => (
          <li key={p.champion.id} className="pick">
            <span className="rank">{i + 1}</span>
            <Icon champ={p.champion} size={40} />
            <div className="pick-body">
              <div className="pick-head">
                <strong>
                  {p.champion.name}
                  {p.offMeta && (
                    <span className="tag" title="You play it in this role, but it isn't a usual role for this champion">
                      off-meta
                    </span>
                  )}
                </strong>
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

function Roles({ roles }: { roles: RoleView[] }) {
  if (!roles.length) return null;
  return (
    <section className="card roles">
      <h2>Your roles</h2>
      <p className="muted small">Ranked by your recent results. Information only — you choose your positions.</p>
      <ol>
        {roles.map((r, i) => (
          <li key={r.role} className={`role${r.enoughData ? "" : " thin"}`}>
            <span className="rank">{r.enoughData ? i + 1 : "·"}</span>
            <div className="role-body">
              <div className="pick-head">
                <strong className="role-name">{r.role}</strong>
                <span className="muted small">
                  {r.games} game{r.games === 1 ? "" : "s"} · {Math.round(r.winRate * 100)}% win rate
                </span>
              </div>
              {r.enoughData ? (
                <div className="role-champs">
                  {r.champions.map((c) => (
                    <span key={c.id} className="role-champ">
                      <Icon champ={c} size={22} />
                      {c.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted small">Not enough games to judge</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}


const RIOT_NOTICE =
  "LoL Draft Coach isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.";

/** First run (or after sign-out): connect this PC to the coach server with an invite code. */
function Onboarding({ account, lcuConnected }: { account: AccountView; lcuConnected: boolean }) {
  const [serverUrl, setServerUrl] = useState(account.serverUrl ?? account.defaultServerUrl ?? "");
  const [code, setCode] = useState("");
  const busy = account.state === "registering";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!busy) void window.coach.register(serverUrl, code);
  };
  return (
    <section className="card onboarding">
      <h2>{account.state === "mismatch" ? "Different account" : "Connect to your coach"}</h2>
      {account.state === "mismatch" ? (
        <p>{account.message}</p>
      ) : (
        <p className="muted small">
          Paste the invite code you were given. Your Riot ID is read from the League client you’re logged into, and only your own games are
          loaded.
        </p>
      )}
      <form className="form" onSubmit={submit}>
        <label htmlFor="server-url">Server address</label>
        <input id="server-url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="coach.example.app" autoComplete="off" spellCheck={false} />
        <label htmlFor="invite-code">Invite code</label>
        <input id="invite-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
        <button className="btn primary" type="submit" disabled={busy || !code.trim() || !serverUrl.trim() || !lcuConnected}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
      {!lcuConnected && <p className="muted small">Open the League client and log in first.</p>}
      {account.state === "error" && account.message && <p className="warn small">{account.message}</p>}
      {account.state === "unregistered" && account.message && <p className="warn small">{account.message}</p>}
    </section>
  );
}

/** Who the app is connected as, with sign-out and data deletion (confirmed in the page). */
function AccountFooter({ account }: { account: AccountView | null }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <footer className="account-footer small">
      {account === null ? (
        <span className="muted">Developer mode: your games come straight from the Riot API key in .env.</span>
      ) : account.state === "registered" ? (
        <div className="account-row">
          <span className="muted">Connected as {account.riotId}</span>
          {confirming ? (
            <span className="confirm">
              Delete everything the coach stores about you?
              <button className="btn danger" onClick={() => void window.coach.deleteData().then(() => setConfirming(false))}>
                Delete
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <span className="actions">
              <button className="btn" onClick={() => void window.coach.signOut()}>
                Sign out
              </button>
              <button className="btn" onClick={() => setConfirming(true)}>
                Delete my data
              </button>
            </span>
          )}
          {account.message && <span className="warn">{account.message}</span>}
        </div>
      ) : null}
      <p className="legal">{RIOT_NOTICE}</p>
    </footer>
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

        {state.account && state.account.state !== "registered" && (
          <Onboarding account={state.account} lcuConnected={status.lcu === "connected"} />
        )}

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
          <>
          <section className="card idle">
            <p>No champ select in progress.</p>
            <p className="muted small">Open a lobby (a custom draft lobby works) and the draft will show up here live.</p>
            {state.status.profile.state !== "idle" && state.status.profile.state !== "ready" && (
              <Picks picks={[]} role={state.pickRole} state={state} />
            )}
          </section>
          <Roles roles={state.roles} />
          </>
        )}
        <AccountFooter account={state.account} />
      </main>
    </div>
  );
}
