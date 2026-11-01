import { useEffect, useLayoutEffect, useState } from "react";
import type { ViewState } from "../shared/view";
import { ChampSelectScreen } from "./screens/ChampSelectScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LockedInScreen } from "./screens/LockedInScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { screenFor } from "./first-use";
import { setCopy, setMinGames, setRoleLabels, t } from "./format";
import { perfCommitted, perfReceived } from "./perf";
import { useRuneChoice } from "./rune-choice";

/** Picks the screen for the moment: connect, champ select (ban or pick), locked in, the tour, or the lobby. */
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
  // Above the screens: locking in a hovered champion switches screen, and the chosen rune option stays.
  const runes = useRuneChoice((state?.myPick ?? state?.hoverPick)?.champion.id ?? null);
  // Opened again from the footer; a draft ends that, and it doesn't come back after the game. A first tour does.
  const [tourOpen, setTourOpen] = useState(false);
  const drafting = state?.draft != null || state?.myPick != null;
  useEffect(() => {
    if (drafting) setTourOpen(false);
  }, [drafting]);

  if (!state) return <div className="window loading">Starting…</div>;
  setRoleLabels(state.roleLabels);
  setCopy(state.copy);
  setMinGames(state.limits.minGames);
  const { account, draft, myPick } = state;
  const screen = screenFor(state, tourOpen);
  if (screen === "connect" && account) return <ConnectScreen state={state} account={account} />;
  if (screen === "lockedIn" && myPick) return <LockedInScreen state={state} pick={myPick} runes={runes} note={draft ? undefined : t("locked.after")} />;
  if (screen === "champSelect" && draft) return <ChampSelectScreen state={state} draft={draft} runes={runes} />;
  if (screen === "tour") {
    return (
      <OnboardingScreen
        state={state}
        onClose={() => {
          setTourOpen(false);
          window.coach.tourDone();
        }}
      />
    );
  }
  return <LobbyScreen state={state} onHowItWorks={() => setTourOpen(true)} />;
}
