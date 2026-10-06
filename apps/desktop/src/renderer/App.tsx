import { useEffect, useState } from "react";
import type { ViewState } from "../shared/view";
import { ChampSelectScreen } from "./screens/ChampSelectScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LockedInScreen } from "./screens/LockedInScreen";

/** Picks the screen for the moment: connect, champ select (ban or pick), locked in, or the lobby. */
export function App() {
  const [state, setState] = useState<ViewState | null>(null);
  useEffect(() => window.coach.onState(setState), []);

  if (!state) return <div className="window loading">Starting…</div>;
  const { account, draft, myPick } = state;
  if (account && account.state !== "registered") return <ConnectScreen state={state} account={account} />;
  if (draft && myPick) return <LockedInScreen state={state} pick={myPick} />;
  if (draft) return <ChampSelectScreen state={state} draft={draft} />;
  if (myPick) return <LockedInScreen state={state} pick={myPick} note="Champ select is over: your loadout stays here until the game ends." />;
  return <LobbyScreen state={state} />;
}
