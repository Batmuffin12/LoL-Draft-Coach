import { useState, type ReactNode } from "react";
import type { LoadoutView, MyPickView, ViewState } from "../../shared/view";
import { Button } from "../components/Button";
import { ChampIcon } from "../components/ChampIcon";
import { BuildTab, MatchupsPlanTab, RunesTab, type LoadoutTab } from "../components/Loadout";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { WinChance } from "../components/WinChance";
import { Window } from "../components/Window";
import { count, positionLabel, t } from "../format";
import { Header, Notices } from "./common";

type ImportKind = "runes" | "items" | "all";

/** Import busy state: one click at a time, only ever from a button. */
export function useImport(): { busy: ImportKind | null; run: (kind: ImportKind) => void } {
  const [busy, setBusy] = useState<ImportKind | null>(null);
  const run = (kind: ImportKind) => {
    if (busy) return;
    setBusy(kind);
    void window.coach.importLoadout(kind).finally(() => setBusy(null));
  };
  return { busy, run };
}

/** What the one import button can write: the rune page and spells, the item set, or both. */
function importKind(l: LoadoutView): ImportKind | null {
  if (!l.canImport) return null;
  const runes = l.page !== null || l.spells !== null;
  const items = l.items.length > 0 || l.commonPath !== null || l.starting !== null;
  return runes && items ? "all" : runes ? "runes" : items ? "items" : null;
}

const IMPORT_LABEL: Record<ImportKind, string> = { all: "import.all", runes: "import.runes", items: "import.items" };
const IMPORT_TITLE =
  "Creates (or updates) an 'LDC:' rune page, sets your two summoner spells in champ select (Flash keeps its key) and saves an item set for this champion. Only when you click.";

/** "From 2,140 games in Gold to Platinum · rough guide": wraps, never cut. */
export function LoadoutSource({ pick }: { pick: MyPickView }) {
  const l = pick.loadout;
  if (!l) return <span className="micro">{t("loadout.none", { champion: pick.champion.name })}</span>;
  return (
    <span className="micro" title={l.thinNote ?? undefined}>
      {t("loadout.source", { games: count(l.games), source: l.source })}
      {l.thinNote ? ` · ${t("loadout.rough")}` : "."}
    </span>
  );
}

/** The Runes and Build footer: one import button (on your click only), what it did, and where the build comes from. */
export function LoadoutFooter({ pick }: { pick: MyPickView }) {
  const { busy, run } = useImport();
  const kind = pick.loadout ? importKind(pick.loadout) : null;
  return (
    <>
      {kind && (
        <Button variant="primary" wide disabled={busy !== null} onClick={() => run(kind)} title={IMPORT_TITLE}>
          {busy ? t("import.busy") : t(IMPORT_LABEL[kind])}
        </Button>
      )}
      {pick.importMessage && <span className="caption text">{pick.importMessage}</span>}
      <LoadoutSource pick={pick} />
    </>
  );
}

/** The body of one loadout tab (or why there is none). */
export function LoadoutBody({ pick, tab }: { pick: MyPickView; tab: LoadoutTab }) {
  if (tab === "matchups") return <MatchupsPlanTab pick={pick} />;
  if (!pick.loadout) {
    return (
      <Section title={tab === "runes" ? "Runes" : t("build.head")}>
        <p className="caption">{t("loadout.none", { champion: pick.champion.name })}</p>
      </Section>
    );
  }
  return tab === "runes" ? <RunesTab loadout={pick.loadout} /> : <BuildTab loadout={pick.loadout} />;
}

/** Your champion, "Locked in · Mid vs Zed", and its win chance, over the tabs. */
function YouStrip({ pick, laneOpponent }: { pick: MyPickView; laneOpponent: string | null }) {
  const where = [pick.role && positionLabel(pick.role), laneOpponent && `vs ${laneOpponent}`].filter(Boolean).join(" ");
  return (
    <div className="you-strip" title={pick.reasons.map((r) => r.text).join("\n") || undefined}>
      <ChampIcon champ={pick.champion} size={44} framed />
      <div className="who">
        <span className="label gold">{`${pick.hovering ? "Hovering" : "Locked in"}${where ? ` · ${where}` : ""}`}</span>
        <span className="nm">{pick.champion.name}</span>
      </div>
      <WinChance value={pick.expectedWin} size="row" />
    </div>
  );
}

export function loadoutTabs(): { value: LoadoutTab; label: string }[] {
  return [
    { value: "runes", label: "Runes" },
    { value: "build", label: "Build" },
    { value: "matchups", label: t("matchups.tab") },
  ];
}

/** Locked in (and after champ select until the game ends): Runes · Build · Matchups & plan, Runes first. */
export function LockedInScreen({ state, pick, note }: { state: ViewState; pick: MyPickView; note?: ReactNode }) {
  const [tab, setTab] = useState<LoadoutTab>("runes");
  const meta = state.meta?.state === "ready" ? state.meta : null;
  return (
    <Window
      header={<Header state={state} />}
      band={
        <>
          <YouStrip pick={pick} laneOpponent={state.laneOpponent?.champion?.name ?? null} />
          <Segmented<LoadoutTab> value={tab} onChange={setTab} options={loadoutTabs()} />
        </>
      }
      footer={
        tab === "matchups" ? (
          <span className="micro">{meta ? t("matchups.source", { games: count(meta.matches) }) : t("matchups.empty")}</span>
        ) : (
          <LoadoutFooter pick={pick} />
        )
      }
    >
      <Notices state={state} extra={typeof note === "string" ? note : null} />
      <LoadoutBody pick={pick} tab={tab} />
    </Window>
  );
}
