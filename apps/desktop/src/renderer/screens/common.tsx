import { useState } from "react";
import { canRestartToUpdate, type AccountView, type ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { StatusHeader } from "../components/StatusHeader";
import { count, cx, profileProgress, t, versionText } from "../format";
import { useNow } from "../hooks";

/** Riot's required legal notice, both sentences (developer.riotgames.com/policies/general). */
export const RIOT_NOTICE =
  "LoL Draft Coach isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

/** The title bar with the live meta's patch and age ("16.19 · 12 min"). */
export function Header({ state }: { state: ViewState }) {
  const now = useNow(60_000);
  const { meta, status } = state;
  let metaText: string | null = status.patch ? `Patch ${status.patch}` : null;
  let metaTitle: string | undefined;
  if (meta?.state === "ready") {
    const minutes = Math.max(0, Math.round((now - meta.createdAt) / 60_000));
    const age = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
    // The age is in the tooltip: no player acts on it, and the chip stays short.
    metaText = `${meta.patch ?? status.patch ?? "Live"}${meta.offline ? " · offline" : ""}`;
    metaTitle = `Live meta for rank band ${meta.band}: ${count(meta.matches)} recent ranked games, updated ${age} ago${meta.offline ? ". The server is unreachable: using the last copy" : ""}`;
  }
  return (
    <StatusHeader
      lcu={status.lcu}
      docked={state.docked}
      metaText={metaText}
      metaTitle={metaTitle}
      onDock={() => window.coach.setDocked(!state.docked)}
      onMinimize={() => window.coach.minimize()}
      onClose={() => window.coach.close()}
    />
  );
}

/** Something loading: a micro line, and a thin gold bar when how far along is known. Not a boxed notice. */
export function ProgressRow({ text, done, total }: { text: string; done?: number; total?: number }) {
  const known = done !== undefined && total !== undefined && total > 0;
  const share = known ? Math.max(0, Math.min(1, done / total)) : 0;
  return (
    <div className="progress" role="status">
      <span className="p-text">
        <span>{text}</span>
        {known && <span>{`${Math.round(share * 100)}%`}</span>}
      </span>
      {known && (
        <span className="p-bar" aria-hidden="true">
          <span style={{ width: `${share * 100}%` }} />
        </span>
      )}
    </div>
  );
}

/** One notice per problem, at the top of the scrolling area; loading shows as a progress row. */
export function Notices({ state, extra }: { state: ViewState; extra?: string | null }) {
  const { profile } = state.status;
  const canRetry = state.account?.state === "registered";
  const items: { key: string; tone: "warn" | "info"; text: string; dismiss?: string; retry?: boolean }[] = [
    ...state.notices.map((n) => ({ key: n.key, tone: "warn" as const, text: n.text, dismiss: n.key })),
    ...(profile.state === "error" ? [{ key: "profile", tone: "warn" as const, text: profile.message, retry: canRetry }] : []),
    ...(profile.state === "ready" && profile.problem ? [{ key: "profile", tone: "warn" as const, text: `${profile.problem} Coaching from your games saved on this PC.`, retry: canRetry }] : []),
    ...(state.meta?.state === "error"
      ? [state.meta.noSnapshot ? { key: "meta", tone: "info" as const, text: t("meta.noSnapshot") } : { key: "meta", tone: "warn" as const, text: `${state.meta.message} ${t("meta.ownGames")}`, retry: canRetry }]
      : []),
    ...(extra ? [{ key: "extra", tone: "info" as const, text: extra }] : []),
  ];
  const line = profileProgress(profile);
  const progress = line && <ProgressRow text={line.text} {...(line.total !== undefined ? { done: line.done ?? 0, total: line.total } : {})} />;
  if (!items.length && !progress) return null;
  return (
    <div className="notices">
      {progress}
      {items.map((n) => (
        <Notice key={n.key} tone={n.tone} dismissLabel={t("notice.dismiss")} onDismiss={n.dismiss ? () => window.coach.dismissNotice(n.dismiss!) : undefined}>
          {n.text}
          {n.retry && (
            <>
              {" "}
              <RetryLink />
            </>
          )}
        </Notice>
      ))}
    </div>
  );
}

/** Tries again now what failed; says so until that is done. */
function RetryLink() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="foot-link gold"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void window.coach.retry().finally(() => setBusy(false));
      }}
    >
      {t(busy ? "profile.retrying" : "profile.retry")}
    </button>
  );
}

/** A small text action for the one-line footer. */
function FootLink({ onClick, danger, gold, children }: { onClick: () => void; danger?: boolean; gold?: boolean; children: string }) {
  return (
    <button type="button" className={cx("foot-link", danger && "danger", gold && "gold")} onClick={onClick}>
      {children}
    </button>
  );
}

/** A question in place of the footer's links: what it costs, do it, or don't. While it runs, only what's happening. */
export function ConfirmRow({ ask, yes, busyText, no, busy, danger, onYes, onNo }: { ask: string; yes: string; busyText: string; no: string; busy: boolean; danger?: boolean; onYes: () => void; onNo: () => void }) {
  if (busy) {
    return (
      <div className="foot-row" role="status">
        <span className="micro who">{busyText}</span>
      </div>
    );
  }
  return (
    <div className="foot-row">
      <span className="micro who">{ask}</span>
      <FootLink danger={danger} onClick={onYes}>
        {yes}
      </FootLink>
      <FootLink onClick={onNo}>{no}</FootLink>
    </div>
  );
}

/** Who the app is connected as, the tour again, sign out and data deletion (confirmed in place), the app's version, then the full Riot notice. */
export function AccountFooter({ state, onHowItWorks }: { state: ViewState; onHowItWorks?: (() => void) | undefined }) {
  const { account, app } = state;
  const [confirming, setConfirming] = useState<"signOut" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action().finally(() => {
      setBusy(false);
      setConfirming(null);
    });
  };
  const howItWorks = onHowItWorks && <FootLink onClick={onHowItWorks}>{t("tour.reopen")}</FootLink>;
  return (
    <>
      {account === null ? (
        <div className="foot-row">
          <span className="micro who">Developer mode: games from the Riot API key in .env.</span>
          {howItWorks}
        </div>
      ) : account.state === "registered" ? (
        confirming === "delete" ? (
          <ConfirmRow ask={t("account.delete.ask")} yes={t("account.delete")} busyText={t("account.delete.busy")} no={t("account.delete.no")} busy={busy} danger onYes={() => run(() => window.coach.deleteData())} onNo={() => setConfirming(null)} />
        ) : confirming === "signOut" ? (
          <ConfirmRow ask={t("account.signOut.ask")} yes={t("account.signOut")} busyText={t("account.signOut.busy")} no={t("account.signOut.no")} busy={busy} onYes={() => run(() => window.coach.signOut())} onNo={() => setConfirming(null)} />
        ) : (
          <div className="foot-row">
            <span className="micro who" title={`Connected as ${account.riotId}`}>
              {account.riotId}
            </span>
            {howItWorks}
            <FootLink onClick={() => setConfirming("signOut")}>{t("account.signOut")}</FootLink>
            <FootLink onClick={() => setConfirming("delete")}>{t("account.deleteLink")}</FootLink>
          </div>
        )
      ) : null}
      {account?.state === "registered" && account.message && <span className="micro neg">{account.message}</span>}
      <span className="legal">
        {app.version && <span className={app.updateReady ? "ver ready" : "ver"}>{versionText(app)} · </span>}
        {canRestartToUpdate(state) && (
          <>
            <FootLink gold onClick={() => window.coach.restartToUpdate()}>
              {t("update.restart")}
            </FootLink>
            {" · "}
          </>
        )}
        {RIOT_NOTICE}
      </span>
    </>
  );
}
