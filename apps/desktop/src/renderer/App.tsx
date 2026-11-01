import { useEffect, useLayoutEffect, useState } from "react";
import type { ViewState } from "../shared/view";
import { ChampSelectScreen } from "./screens/ChampSelectScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LockedInScreen } from "./screens/LockedInScreen";
import { screenFor, startTour, tourRunning, type TourRun } from "./first-use";
import { setCopy, setMinGames, setRoleLabels, t } from "./format";
import { perfCommitted, perfReceived } from "./perf";
import { useRuneChoice } from "./rune-choice";

/** Picks the screen for the moment: connect, champ select (ban or pick), locked in, or the lobby (with its tour the first time). */
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
  // Up here, so a first tour a draft interrupted picks up where it was. One reopened from the footer doesn't come back after the game.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourClosed, setTourClosed] = useState(false);
  const [tourRun, setTourRun] = useState<TourRun>(startTour);
  const drafting = state?.draft != null || state?.myPick != null;
  useEffect(() => {
    if (drafting) setTourOpen(false);
  }, [drafting]);

  if (!state) return <div className="window loading">Starting…</div>;
  setRoleLabels(state.roleLabels);
  setCopy(state.copy);
  setMinGames(state.limits.minGames);
  const { account, draft, myPick } = state;
  const screen = screenFor(state);
  if (screen === "connect" && account) return <ConnectScreen state={state} account={account} />;
  if (screen === "lockedIn" && myPick) return <LockedInScreen state={state} pick={myPick} runes={runes} note={draft ? undefined : t("locked.after")} />;
  if (screen === "champSelect" && draft) return <ChampSelectScreen state={state} draft={draft} runes={runes} />;
  const closeTour = () => {
    setTourOpen(false);
    setTourClosed(true);
    setTourRun(startTour());
    window.coach.tourDone();
  };
  return (
    <LobbyScreen
      state={state}
      onHowItWorks={() => {
        setTourRun(startTour());
        setTourOpen(true);
      }}
      tour={tourRunning(state.ui, tourOpen, tourClosed) ? { run: tourRun, onRun: setTourRun, onClose: closeTour } : null}
    />
  );
}
