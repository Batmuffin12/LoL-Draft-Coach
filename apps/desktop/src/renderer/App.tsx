import { useEffect, useLayoutEffect, useState } from "react";
import type { ViewState } from "../shared/view";
import { ChampSelectScreen } from "./screens/ChampSelectScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LockedInScreen } from "./screens/LockedInScreen";
import { setCopy, setRoleLabels } from "./format";
import { perfCommitted, perfReceived } from "./perf";

/** Picks the screen for the moment: connect, champ select (ban or pick), locked in, or the lobby. */
export function App() {
  const [state, setState] = useState<ViewState | null>(null);
  useEffect(
    () =>
      window.coach.onState((s) => {
        perfReceived(s);
        setState(s);
      }),
    [],
  );
  // Dev aid LDC_PERF: when each state was committed and painted (does nothing otherwise).
  useLayoutEffect(() => perfCommitted(state), [state]);

  if (!state) return <div className="window loading">Starting…</div>;
  setRoleLabels(state.roleLabels);
  setCopy(state.copy);
  const { account, draft, myPick } = state;
  if (account && account.state !== "registered") return <ConnectScreen state={state} account={account} />;
  if (draft && myPick) return <LockedInScreen state={state} pick={myPick} />;
  if (draft) return <ChampSelectScreen state={state} draft={draft} />;
  if (myPick) return <LockedInScreen state={state} pick={myPick} note="Champ select is over: your loadout stays here until the game ends." />;
  return <LobbyScreen state={state} />;
}
