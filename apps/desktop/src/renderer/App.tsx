import { useEffect, useState } from "react";
import type { ViewState } from "../shared/view";
import { ChampSelectScreen } from "./screens/ChampSelectScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LockedInScreen } from "./screens/LockedInScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { setCopy, setRoleLabels } from "./format";

/** Picks the screen for the moment: connect, champ select (ban or pick), locked in, or the lobby. */
export function App() {
  const [state, setState] = useState<ViewState | null>(null);
  useEffect(() => window.coach.onState(setState), []);

  if (!state) return <div className="window loading">Starting…</div>;
  setRoleLabels(state.roleLabels);
  setCopy(state.copy);
  const { account, draft, myPick } = state;
  if (account && account.state !== "registered") return <ConnectScreen state={state} account={account} />;
  if (draft && myPick) return <LockedInScreen state={state} pick={myPick} />;
  if (draft) return <ChampSelectScreen state={state} draft={draft} />;
  if (myPick) return <LockedInScreen state={state} pick={myPick} note="Champ select is over: your loadout stays here until the game ends." />;
  // In a lobby with roles chosen: your picks for the next game first.
  if (state.queuePreview?.roles.length) return <QueueScreen state={state} preview={state.queuePreview} />;
  return <LobbyScreen state={state} />;
}
