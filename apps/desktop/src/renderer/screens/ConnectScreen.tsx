import { useState, type FormEvent } from "react";
import type { AccountView, ViewState } from "../../shared/view";
import { Button } from "../components/Button";
import { codeLength, InviteCodeInput } from "../components/InviteCodeInput";
import { Window } from "../components/Window";
import { t } from "../format";
import { Header, Notices, RIOT_NOTICE } from "./common";

/** Characters in an invite code (three boxes of four). */
const CODE_LENGTH = 12;
const STEPS = [1, 2, 3];

/** "https://coach.example.app/" → "coach.example.app". */
const host = (url: string) => url.replace(/^\w+:\/\//, "").replace(/\/+$/, "");

/** First run (or after sign-out): connect this PC to the coach server with an invite code. */
export function ConnectScreen({ state, account }: { state: ViewState; account: AccountView }) {
  const [serverUrl, setServerUrl] = useState(account.serverUrl ?? account.defaultServerUrl ?? "");
  // The address is prefilled: its field only opens on "Change" (or when there is none).
  const [editServer, setEditServer] = useState(!serverUrl);
  const [code, setCode] = useState("");
  const busy = account.state === "registering";
  const lcuConnected = state.status.lcu === "connected";
  const ready = codeLength(code) === CODE_LENGTH && serverUrl.trim() !== "" && lcuConnected;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && ready) void window.coach.register(serverUrl, code);
  };
  const mismatch = account.state === "mismatch";
  const error = (account.state === "error" || account.state === "unregistered") && account.message;
  return (
    <Window
      header={<Header state={state} />}
      footer={
        <>
          {editServer ? (
            <span className="server-edit">
              <label className="micro" htmlFor="server-url">
                {t("connect.server")}
              </label>
              <input id="server-url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://" autoComplete="off" spellCheck={false} />
            </span>
          ) : (
            <span className="foot-row">
              <span className="micro">{`${t("connect.server")} ${host(serverUrl)}`}</span>
              <button type="button" className="foot-link gold" onClick={() => setEditServer(true)}>
                {t("connect.change")}
              </button>
            </span>
          )}
          <span className="legal">{RIOT_NOTICE}</span>
        </>
      }
    >
      <Notices state={state} />
      <section className="connect-intro">
        <span className="t-title">{mismatch ? "Different account" : t("connect.title")}</span>
        <span className="caption text">{mismatch ? account.message : t("connect.intro")}</span>
      </section>
      <form className="connect-form" onSubmit={submit}>
        <label className="label" htmlFor="invite-1">
          {t("connect.code")}
        </label>
        <InviteCodeInput id="invite-1" value={code} onChange={setCode} label={(i, n) => `${t("connect.code")}, part ${i} of ${n}`} />
        {lcuConnected ? (
          <span className="caption center">
            <span className="pos" aria-hidden="true">
              ●
            </span>{" "}
            {t("connect.found")} {account.clientRiotId && <span className="text who">{account.clientRiotId}</span>}
          </span>
        ) : (
          <span className="caption center">{t("connect.noClient")}</span>
        )}
        <Button variant="primary" type="submit" wide disabled={busy || !ready}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {error && <span className="caption neg center">{account.message}</span>}
      </form>
      <section className="connect-how">
        {STEPS.map((n) => (
          <div key={n} className="step">
            <b>{n}</b>
            <span>
              <span className="text">{t(`connect.step${n}.lead`)}</span> <span className="caption">{t(`connect.step${n}`)}</span>
            </span>
          </div>
        ))}
      </section>
    </Window>
  );
}
