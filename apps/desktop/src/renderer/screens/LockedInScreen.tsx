import { useState, type ReactNode } from "react";
import type { MyPickView, ViewState } from "../../shared/view";
import { ChampIcon } from "../components/ChampIcon";
import { BuildTab, MatchupsTab, RunesTab, type LoadoutTab } from "../components/Loadout";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { WinChance } from "../components/WinChance";
import { Window } from "../components/Window";
import { count, positionLabel } from "../format";
import { Header, Notices } from "./common";

/** Import busy state: one click at a time, only ever from a button. */
export function useImport(): { busy: "runes" | "items" | null; run: (kind: "runes" | "items") => void } {
  const [busy, setBusy] = useState<"runes" | "items" | null>(null);
  const run = (kind: "runes" | "items") => {
    if (busy) return;
    setBusy(kind);
    void window.coach.importLoadout(kind).finally(() => setBusy(null));
  };
  return { busy, run };
}

/** "2,140 games · Gold to Platinum · rough guide" on one line; the full note on hover. */
export function LoadoutSource({ pick }: { pick: MyPickView }) {
  const l = pick.loadout;
  if (!l) return <span className="micro">No build data for {pick.champion.name} in this role yet.</span>;
  const full = `From ${count(l.games)} games in ${l.source}.${l.thinNote ? ` ${l.thinNote}.` : ""}`;
  return (
    <span className="micro one-line" title={full}>
      {count(l.games)} games · {l.source}
      {l.thinNote ? " · rough guide" : ""}
    </span>
  );
}

/** The body of one loadout tab (or why there is none). */
export function LoadoutBody({ pick, tab }: { pick: MyPickView; tab: LoadoutTab }) {
  const { busy, run } = useImport();
  if (tab === "matchups") return <MatchupsTab pick={pick} />;
  if (!pick.loadout) {
    return (
      <Section title="Loadout">
        <p className="caption">No build data for {pick.champion.name} in this role yet.</p>
      </Section>
    );
  }
  const props = { loadout: pick.loadout, onImport: run, busy, importMessage: pick.importMessage };
  return tab === "runes" ? <RunesTab {...props} /> : <BuildTab {...props} />;
}

/** Your champion, "Locked in · Middle vs Zed", and its win chance, over the tabs. */
function YouStrip({ pick, laneOpponent }: { pick: MyPickView; laneOpponent: string | null }) {
  const where = [pick.role && positionLabel(pick.role), laneOpponent && `vs ${laneOpponent}`].filter(Boolean).join(" ");
  return (
    <div className="you" title={pick.reasons.map((r) => r.text).join("\n") || undefined}>
      <ChampIcon champ={pick.champion} size={44} framed />
      <div className="who">
        <span className="label gold">{`${pick.hovering ? "Hovering" : "Locked in"}${where ? ` · ${where}` : ""}`}</span>
        <span className="nm">{pick.champion.name}</span>
      </div>
      <WinChance value={pick.expectedWin} size="row" />
    </div>
  );
}

export const LOADOUT_TABS: { value: LoadoutTab; label: string }[] = [
  { value: "runes", label: "Runes" },
  { value: "build", label: "Build" },
  { value: "matchups", label: "Matchups" },
];

/** Locked in (and after champ select until the game ends): Runes · Build · Matchups, Runes first. */
export function LockedInScreen({ state, pick, note }: { state: ViewState; pick: MyPickView; note?: ReactNode }) {
  const [tab, setTab] = useState<LoadoutTab>("runes");
  return (
    <Window
      header={<Header state={state} />}
      band={
        <>
          <YouStrip pick={pick} laneOpponent={state.laneOpponent?.champion?.name ?? null} />
          <Segmented<LoadoutTab> value={tab} onChange={setTab} options={LOADOUT_TABS} />
        </>
      }
      footer={<LoadoutSource pick={pick} />}
    >
      <Notices state={state} extra={typeof note === "string" ? note : null} />
      <LoadoutBody pick={pick} tab={tab} />
    </Window>
  );
}
