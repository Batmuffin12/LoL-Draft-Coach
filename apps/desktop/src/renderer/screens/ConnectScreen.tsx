import { useState, type FormEvent } from "react";
import type { AccountView, ViewState } from "../../shared/view";
import { Button } from "../components/Button";
import { Section } from "../components/Section";
import { Window } from "../components/Window";
import { Header, Notices, RIOT_NOTICE } from "./common";

/** First run (or after sign-out): connect this PC to the coach server with an invite code. */
export function ConnectScreen({ state, account }: { state: ViewState; account: AccountView }) {
  const [serverUrl, setServerUrl] = useState(account.serverUrl ?? account.defaultServerUrl ?? "");
  const [code, setCode] = useState("");
  const busy = account.state === "registering";
  const lcuConnected = state.status.lcu === "connected";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void window.coach.register(serverUrl, code);
  };
  return (
    <Window header={<Header state={state} />} footer={<span className="micro">{RIOT_NOTICE}</span>}>
      <Notices state={state} />
      <Section title={account.state === "mismatch" ? "Different account" : "Connect to your coach"}>
        {account.state === "mismatch" ? (
          <p className="caption text">{account.message}</p>
        ) : (
          <p className="caption">Paste the invite code you were given. Your Riot ID is read from the League client you’re logged into, and only your own games are loaded.</p>
        )}
        <form className="form" onSubmit={submit}>
          <label className="label" htmlFor="server-url">
            Server address
          </label>
          <input id="server-url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="coach.example.app" autoComplete="off" spellCheck={false} />
          <label className="label" htmlFor="invite-code">
            Invite code
          </label>
          <input id="invite-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
          <Button variant="primary" type="submit" wide disabled={busy || !code.trim() || !serverUrl.trim() || !lcuConnected}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </form>
        {!lcuConnected && <p className="caption">Open the League client and log in first.</p>}
        {(account.state === "error" || account.state === "unregistered") && account.message && <p className="caption neg">{account.message}</p>}
      </Section>
    </Window>
  );
}
