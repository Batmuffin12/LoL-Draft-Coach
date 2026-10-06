import { useState, type ReactNode } from "react";
import type { MyPickView, ViewState } from "../../shared/view";
import { ChampIcon } from "../components/ChampIcon";
import { Loadout, type LoadoutTab } from "../components/Loadout";
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

/** "From 2,140 games in Gold to Platinum. Not much data yet: treat it as a rough guide." */
export function LoadoutSource({ pick }: { pick: MyPickView }) {
  const l = pick.loadout;
  if (!l) return <span className="micro">No build data for {pick.champion.name} in this role yet.</span>;
  return (
    <span className="micro">
      From {count(l.games)} games in {l.source}.{l.thinNote ? ` ${l.thinNote}.` : ""}
    </span>
  );
}

/** The loadout body for one tab (or why there is none). */
export function LoadoutBody({ pick, tab }: { pick: MyPickView; tab: LoadoutTab }) {
  const { busy, run } = useImport();
  if (!pick.loadout) {
    return (
      <Section title="Loadout">
        <p className="caption">No build data for {pick.champion.name} in this role yet.</p>
      </Section>
    );
  }
  return <Loadout loadout={pick.loadout} view={tab} onImport={run} busy={busy} importMessage={pick.importMessage} />;
}

/** Your locked-in champion and its win chance, over the loadout tabs. */
function YouStrip({ pick }: { pick: MyPickView }) {
  return (
    <div className="you" title={pick.reasons.map((r) => r.text).join("\n") || undefined}>
      <ChampIcon champ={pick.champion} size={44} framed />
      <div className="who">
        <span className="label gold">{`${pick.hovering ? "Hovering" : "Locked in"}${pick.role ? ` · ${positionLabel(pick.role)}` : ""}`}</span>
        <span className="nm">{pick.champion.name}</span>
      </div>
      <WinChance value={pick.expectedWin} size="row" />
    </div>
  );
}

/** Locked in (and after champ select until the game ends): runes & spells, and the build. */
export function LockedInScreen({ state, pick, note }: { state: ViewState; pick: MyPickView; note?: ReactNode }) {
  const [tab, setTab] = useState<LoadoutTab>("runes");
  return (
    <Window
      header={<Header state={state} />}
      band={
        <>
          <YouStrip pick={pick} />
          <Segmented<LoadoutTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "runes", label: "Runes & spells" },
              { value: "build", label: "Build" },
            ]}
          />
        </>
      }
      footer={<LoadoutSource pick={pick} />}
    >
      <Notices state={state} extra={typeof note === "string" ? note : null} />
      <LoadoutBody pick={pick} tab={tab} />
    </Window>
  );
}
