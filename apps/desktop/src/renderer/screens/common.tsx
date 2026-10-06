import { useState } from "react";
import type { AccountView, ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { StatusHeader } from "../components/StatusHeader";
import { count } from "../format";
import { useNow } from "../hooks";

export const RIOT_NOTICE =
  "LoL Draft Coach isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.";

/** The title bar with the live meta's patch and age ("16.19 · 12 min"). */
export function Header({ state }: { state: ViewState }) {
  const now = useNow(60_000);
  const { meta, status } = state;
  let metaText: string | null = status.patch ? `Patch ${status.patch}` : null;
  let metaTitle: string | undefined;
  if (meta?.state === "ready") {
    const minutes = Math.max(0, Math.round((now - meta.createdAt) / 60_000));
    const age = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
    metaText = `${meta.patch ?? status.patch ?? "Live"} · ${age}${meta.offline ? " · offline" : ""}`;
    metaTitle = `Live meta for rank band ${meta.band}: ${count(meta.matches)} recent ranked games${meta.offline ? ". The server is unreachable: using the last copy" : ""}`;
  }
  return (
    <StatusHeader
      lcu={status.lcu}
      docked={state.docked}
      metaText={metaText}
      metaTitle={metaTitle}
      onDock={() => window.coach.setDocked(!state.docked)}
      onClose={() => window.coach.close()}
    />
  );
}

/** One notice per problem, at the top of the scrolling area. */
export function Notices({ state, extra }: { state: ViewState; extra?: string | null }) {
  const { profile } = state.status;
  const items: { tone: "warn" | "info"; text: string }[] = [
    ...state.notices.map((text) => ({ tone: "warn" as const, text })),
    ...(profile.state === "loading" ? [{ tone: "info" as const, text: `Loading your match history: ${profile.done} of ${profile.total}` }] : []),
    ...(profile.state === "error" ? [{ tone: "warn" as const, text: profile.message }] : []),
    ...(state.meta?.state === "error" ? [{ tone: "warn" as const, text: `No live meta yet: ${state.meta.message}` }] : []),
    ...(extra ? [{ tone: "info" as const, text: extra }] : []),
  ];
  if (!items.length) return null;
  return (
    <div className="notices">
      {items.map((n) => (
        <Notice key={n.text} tone={n.tone}>
          {n.text}
        </Notice>
      ))}
    </div>
  );
}

/** A small text action for the one-line footer. */
function FootLink({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: string }) {
  return (
    <button type="button" className={danger ? "foot-link danger" : "foot-link"} onClick={onClick}>
      {children}
    </button>
  );
}

/** Who the app is connected as, sign out and data deletion (confirmed in the panel), and the Riot notice: kept short. */
export function AccountFooter({ account }: { account: AccountView | null }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {account === null ? (
        <span className="micro">Developer mode: games from the Riot API key in .env.</span>
      ) : account.state === "registered" ? (
        confirming ? (
          <div className="foot-row">
            <span className="micro one-line">Delete everything the coach stores about you?</span>
            <span className="actions">
              <FootLink danger onClick={() => void window.coach.deleteData().then(() => setConfirming(false))}>
                Delete
              </FootLink>
              <FootLink onClick={() => setConfirming(false)}>Keep</FootLink>
            </span>
          </div>
        ) : (
          <div className="foot-row">
            <span className="micro one-line" title={`Connected as ${account.riotId}`}>
              {account.riotId}
            </span>
            <span className="actions">
              <FootLink onClick={() => void window.coach.signOut()}>Sign out</FootLink>
              <FootLink onClick={() => setConfirming(true)}>Delete my data</FootLink>
            </span>
          </div>
        )
      ) : null}
      {account?.state === "registered" && account.message && <span className="micro neg">{account.message}</span>}
      <span className="legal">{RIOT_NOTICE}</span>
    </>
  );
}
