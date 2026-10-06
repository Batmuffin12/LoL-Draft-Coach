import { useEffect, useState } from "react";
import type { FactorName } from "@ldc/shared";
import type { AccountView, BanView, ChampView, DraftView, IconView, LoadoutItemView, LoadoutView, MetaView, MyPickView, PickView, PlaystyleView, RoleView, SlotView, ViewState } from "../shared/view";

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
      <h2 className="picks-head">
        <span>
          Suggested picks{role ? <span className="muted"> · {role}</span> : null}
        </span>
        {state.pickAdvice.confidence && picks.length > 0 && (
          <span className={`confidence ${state.pickAdvice.confidence.level}`}>{state.pickAdvice.confidence.label}</span>
        )}
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
                {p.expectedWin !== null ? (
                  <span className="score" title="Predicted win chance in this draft, from the live meta in your rank and your own games">
                    ≈ {Math.round(p.expectedWin * 100)}%
                  </span>
                ) : (
                  <span className="score">{Math.round(p.score * 100)}</span>
                )}
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
      {state.pickAdvice.whyNot && picks.length > 0 && <p className="why-not">{state.pickAdvice.whyNot}</p>}
      <p className="disclaimer">Suggestions only — you choose and lock your champion.</p>
    </section>
  );
}

/** The champion you locked in, and how it looks in this draft. Runes and items will go here (milestone 6). */
function GameIcon({ icon, size = 22, title }: { icon: IconView; size?: number; title?: string }) {
  const t = title ?? icon.name;
  return icon.iconUrl ? (
    <img className="icon game" src={icon.iconUrl} width={size} height={size} alt={icon.name} title={t} />
  ) : (
    <div className="icon empty" style={{ width: size, height: size }} title={t} />
  );
}

const tip = (i: LoadoutItemView) => [i.name, ...i.reasons].join("\n");

function LoadoutRow({ label, children, reason }: { label: string; children: React.ReactNode; reason?: string | null }) {
  return (
    <div className="lo-row">
      <span className="lo-label">{label}</span>
      <div className="lo-body">
        <div className="lo-icons">{children}</div>
        {reason && <div className="lo-reason">{reason}</div>}
      </div>
    </div>
  );
}

function ImportButtons({ loadout: l, message }: { loadout: LoadoutView; message: string | null }) {
  const [busy, setBusy] = useState<"runes" | "items" | null>(null);
  const run = (kind: "runes" | "items") => {
    if (busy) return;
    setBusy(kind);
    void window.coach.importLoadout(kind).finally(() => setBusy(null));
  };
  if (!l.canImport) return null;
  return (
    <div className="lo-import">
      {l.page && (
        <button className="btn" disabled={busy !== null} onClick={() => run("runes")} title="Creates (or updates) an 'LDC:' rune page in your client">
          {busy === "runes" ? "Importing…" : "Import runes"}
        </button>
      )}
      {(l.items.length > 0 || l.commonPath || l.starting) && (
        <button className="btn" disabled={busy !== null} onClick={() => run("items")} title="Saves an item set for this champion; it shows in the shop in game">
          {busy === "items" ? "Importing…" : "Import item set"}
        </button>
      )}
      {message && <span className="muted small">{message}</span>}
    </div>
  );
}

function Loadout({ loadout: l, importMessage }: { loadout: LoadoutView; importMessage: string | null }) {
  return (
    <div className="loadout">
      {l.page && (
        <LoadoutRow label="Runes" reason={l.page.reason}>
          <GameIcon icon={l.page.runes[0]!} size={28} />
          <strong className="lo-name">{l.page.runes[0]!.name}</strong>
          {l.page.runes.slice(1).map((r, i) => (
            <GameIcon key={`${r.id}-${i}`} icon={r} size={18} />
          ))}
          <GameIcon icon={l.page.secondary} size={16} title={`Secondary: ${l.page.secondary.name}`} />
        </LoadoutRow>
      )}
      {l.situationalRunes.length > 0 && (
        <LoadoutRow label="Consider" reason={l.situationalRunes[0]!.reasons[0] ?? null}>
          {l.situationalRunes.map((r) => (
            <span key={r.id} className="lo-chip" title={tip(r)}>
              <GameIcon icon={r} size={16} title={tip(r)} /> {r.name}
            </span>
          ))}
        </LoadoutRow>
      )}
      {l.spells && (
        <LoadoutRow label="Spells" reason={l.spells.reason}>
          {l.spells.spells.map((s) => (
            <GameIcon key={s.id} icon={s} />
          ))}
        </LoadoutRow>
      )}
      {l.skills && (
        <LoadoutRow label="Skills" reason={l.skills.reason}>
          <span className="lo-skills">
            Start {l.skills.first.join(" ")} · Max {l.skills.order.join(" > ")}
          </span>
        </LoadoutRow>
      )}
      {l.starting && (
        <LoadoutRow label="Start" reason={l.starting.reason}>
          {l.starting.items.map((it, i) => (
            <GameIcon key={`${it.id}-${i}`} icon={it} />
          ))}
        </LoadoutRow>
      )}
      {l.items.length > 0 && (
        <div className="lo-row">
          <span className="lo-label">Build</span>
          <ol className="lo-build">
            {l.items.map((s) => (
              <li key={s.slot}>
                <div className="lo-icons">
                  <GameIcon icon={s.top} size={26} title={tip(s.top)} />
                  <strong className="lo-name">{s.top.name}</strong>
                  {s.alternatives.length > 0 && <span className="muted small">or</span>}
                  {s.alternatives.map((a) => (
                    <GameIcon key={a.id} icon={a} size={18} title={tip(a)} />
                  ))}
                </div>
                {s.top.reasons[0] && <div className="lo-reason">{s.top.reasons[0]}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {l.commonPath && (
        <LoadoutRow label="Build" reason={l.commonPath.reason}>
          {l.commonPath.items.map((it) => (
            <GameIcon key={it.id} icon={it} size={24} />
          ))}
        </LoadoutRow>
      )}
      <ImportButtons loadout={l} message={importMessage} />
      <p className="muted small lo-source">
        From {l.games.toLocaleString("en-US")} games in {l.source}.{l.thinNote ? ` ${l.thinNote}.` : ""} Hover an icon for details.
      </p>
    </div>
  );
}

function YourPick({ pick }: { pick: MyPickView }) {
  return (
    <section className="card picks your-pick">
      <h2 className="picks-head">
        <span>
          Your pick{pick.role ? <span className="muted"> · {pick.role}</span> : null}
        </span>
      </h2>
      <div className="pick">
        <Icon champ={pick.champion} size={48} />
        <div className="pick-body">
          <div className="pick-head">
            <strong>{pick.champion.name}</strong>
            {pick.expectedWin !== null && (
              <span className="score" title="Predicted win chance in this draft, from the live meta in your rank and your own games">
                ≈ {Math.round(pick.expectedWin * 100)}%
              </span>
            )}
          </div>
          {pick.reasons.length > 0 && (
            <ul className="reasons">
              {pick.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {pick.loadout ? (
        <Loadout loadout={pick.loadout} importMessage={pick.importMessage} />
      ) : (
        <p className="muted small">Locked in. No build data for {pick.champion.name} in this role yet.</p>
      )}
    </section>
  );
}

/** Ban suggestions (ban phase, live meta). */
function BanList({ bans, start = 1 }: { bans: BanView[]; start?: number }) {
  return (
    <ol>
      {bans.map((b, i) => (
        <li key={b.champion.id} className="pick">
          <span className="rank">{start + i}</span>
          <Icon champ={b.champion} size={32} />
          <div className="pick-body">
            <strong>{b.champion.name}</strong>
            <ul className="reasons">
              {b.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Ban suggestions, plus extra ones for the champion you're hovering. */
function BanSuggestions({ bans, hover }: { bans: BanView[]; hover: ViewState["hoverBans"] }) {
  if (!bans.length && !hover?.bans.length) return null;
  return (
    <section className="card picks bans-card">
      <h2 className="picks-head">
        <span>Suggested bans</span>
      </h2>
      <BanList bans={bans} />
      {hover && hover.bans.length > 0 && (
        <>
          <h3 className="hover-bans-head">
            <Icon champ={hover.champion} size={18} /> For your {hover.champion.name}
          </h3>
          <BanList bans={hover.bans} start={bans.length + 1} />
        </>
      )}
      <p className="disclaimer">Suggestions only — you choose your ban.</p>
    </section>
  );
}

/** "Live meta · patch 16.19 · 2,140 games · 12 min old" (or why there is none). */
function MetaLine({ meta }: { meta: MetaView | null }) {
  const now = useNow(60_000);
  if (!meta) return null;
  if (meta.state === "error") return <span className="muted" title={meta.message}> · no live meta yet</span>;
  const minutes = Math.max(0, Math.round((now - meta.createdAt) / 60_000));
  const age = minutes < 60 ? `${minutes} min old` : `${Math.round(minutes / 60)} h old`;
  return (
    <span className="muted" title={`Rank band ${meta.band}: ${meta.matches.toLocaleString()} recent ranked games${meta.offline ? " (server unreachable: using the last copy)" : ""}`}>
      {" "}· live meta{meta.patch ? ` ${meta.patch}` : ""}, {meta.matches.toLocaleString()} games, {age}
      {meta.offline ? " (offline)" : ""}
    </span>
  );
}

/** Your playstyle per role: each axis is a diverging bar around "typical" (50) for players in that role in your games. */
function Playstyle({ styles }: { styles: PlaystyleView[] }) {
  const [role, setRole] = useState<string | null>(null);
  if (!styles.length) return null;
  const current = styles.find((p) => p.role === role) ?? styles[0]!;
  return (
    <section className="card playstyle">
      <h2>Your style</h2>
      {styles.length > 1 && (
        <div className="role-tabs" role="tablist">
          {styles.map((p) => (
            <button key={p.role} role="tab" aria-selected={p.role === current.role} className={`tab${p.role === current.role ? " on" : ""}`} onClick={() => setRole(p.role)}>
              {p.role}
            </button>
          ))}
        </div>
      )}
      <p className="muted small">
        Your last {current.games} {current.role} games, compared with the other {current.role} players in your matches. 50 is typical.
      </p>
      <ul className="axes">
        {current.axes.map((a) => {
          const left = Math.min(a.score, 50);
          const width = Math.abs(a.score - 50);
          return (
            <li key={a.axis} className={`axis ${a.level}`} title={`${a.label}: ${a.score} (${a.levelLabel}), ${a.games} games`}>
              <div className="axis-head">
                <span>{a.label}</span>
                <span className="axis-score">{a.score}</span>
              </div>
              <div className="diverging" aria-hidden="true">
                <span className="mid" />
                <span className="fill" style={{ left: `${left}%`, width: `${width}%` }} />
              </div>
              {a.detail && <span className="axis-detail">{a.detail}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Roles({ roles }: { roles: RoleView[] }) {
  if (!roles.length) return null;
  return (
    <section className="card roles">
      <h2>Your roles and pool</h2>
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
                <>
                  <div className="role-champs">
                    {r.pool.map((c) => (
                      <span
                        key={c.champion.id}
                        className={`role-champ tier-${c.tier}`}
                        title={`${c.tierLabel}: ${c.games} game${c.games === 1 ? "" : "s"} in this role${c.winRate === null ? "" : `, ${Math.round(c.winRate * 100)}% win rate`}`}
                      >
                        <Icon champ={c.champion} size={22} dim={c.tier === "rusty"} />
                        <span className="role-champ-text">
                          {c.champion.name}
                          <span className="tier">{c.tierLabel}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                  {r.holes.map((h) => (
                    <p key={h.text} className="hole small">
                      <strong>{h.text}</strong>
                      {h.evidence && <span className="muted"> · {h.evidence}</span>}
                      {h.coveredBy && <span className="covered"> {h.coveredBy}.</span>}
                    </p>
                  ))}
                </>
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
          <MetaLine meta={state.meta} />
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

            <BanSuggestions bans={state.bans} hover={state.hoverBans} />
            {state.myPick ? <YourPick pick={state.myPick} /> : <Picks picks={state.picks} role={state.pickRole} state={state} />}

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
          <Playstyle styles={state.playstyle} />
          <Roles roles={state.roles} />
          </>
        )}
        <AccountFooter account={state.account} />
      </main>
    </div>
  );
}
