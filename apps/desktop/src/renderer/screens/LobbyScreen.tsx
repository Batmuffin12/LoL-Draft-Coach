import { useEffect, useState } from "react";
import type { ViewState } from "../../shared/view";
import { Notice } from "../components/Notice";
import { LobbyTour } from "../components/Tour";
import { LOBBY_TOUR, openAt, tourSteps, type TourRun } from "../first-use";
import { Pills } from "../components/Pills";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { needsClient, t } from "../format";
import { useNow } from "../hooks";
import { Browse, initialBrowse, type BrowseState } from "./Browse";
import { AccountFooter, Header, Notices } from "./common";
import { LastGame } from "./LastGame";
import { Month } from "./Month";
import { MyGames } from "./MyGames";
import { NewChamps } from "./NewChamps";
import { Pool } from "./Pool";
import { Style } from "./Style";
import { Suggestion } from "./Suggestion";

type MainTab = "suggestion" | "last" | "me" | "champions";
type SubTab = "style" | "month" | "my-games" | "browse" | "pool" | "new";

/** The main tabs with sub-tabs, the first one opening first. A new sub-tab is one entry here, one line in `SubScreen` and its `tabs.*` label. */
const SUB_TABS: Record<"me" | "champions", SubTab[]> = {
  me: ["style", "month", "my-games"],
  champions: ["browse", "pool", "new"],
};

/** These two don't depend on being in a lobby or on your roles: no line about a draft or the client above them. */
const LOOK_UP_TABS: readonly (SubTab | null)[] = ["browse", "my-games"];

/** After a game the Last game tab opens first, for this long. */
const RECENT_GAME_MS = 12 * 3_600_000;

/** Out of champ select: your playstyle per role, and your pool per role with its gaps. As many roles open as fit, so nothing scrolls. */
export function LobbyScreen({ state, onHowItWorks, tour }: { state: ViewState; onHowItWorks?: () => void; tour?: LobbyTourControl | null }) {
  return <Lobby state={state} onHowItWorks={onHowItWorks} tour={tour ?? null} />;
}

/** The lobby tour while it runs: where it is, and what to do when it moves or ends. */
export interface LobbyTourControl {
  run: TourRun;
  onRun: (run: TourRun) => void;
  onClose: () => void;
}

const hasSub = (tab: string, sub: string) => (SUB_TABS[tab as keyof typeof SUB_TABS] as string[] | undefined)?.includes(sub) ?? false;

function Lobby({ state, onHowItWorks, tour }: { state: ViewState; onHowItWorks: (() => void) | undefined; tour: LobbyTourControl | null }) {
  const recent = state.lastGame !== null && Date.now() - (state.lastGame.endedAt ?? state.lastGame.lockedAt) < RECENT_GAME_MS;
  const home: MainTab = recent ? "last" : "me";
  const [tab, setTab] = useState<MainTab>(home);
  const [subs, setSubs] = useState<Record<keyof typeof SUB_TABS, SubTab>>({ me: SUB_TABS.me[0]!, champions: SUB_TABS.champions[0]! });
  // A newly logged game (it arrives after the panel opens): show it first.
  const latest = state.lastGame?.lockedAt ?? 0;
  // In a lobby with roles chosen: the Next game tab appears and opens; it goes when the lobby does.
  const preview = state.queuePreview?.roles.length ? state.queuePreview : null;
  useEffect(() => {
    if (recent && !preview) setTab("last");
  }, [latest]);
  const queued = preview ? preview.roles.map((r) => r.role).join(",") : "";
  useEffect(() => {
    if (queued) setTab("suggestion");
  }, [queued]);
  // The tour opens tabs itself while it runs; afterwards you are back where you were.
  const steps = tour ? tourSteps(LOBBY_TOUR, hasSub, tour.run.skipped) : [];
  const opened = tour ? openAt(steps, tour.run.index) : null;
  const wanted: MainTab = opened?.tab ?? tab;
  const shown: MainTab = wanted === "suggestion" && !preview ? home : wanted;
  const group = shown === "me" || shown === "champions" ? shown : null;
  const sub = group ? ((opened?.sub as SubTab | undefined) ?? subs[group]) : null;
  const openSub = (g: keyof typeof SUB_TABS, value: SubTab) => {
    setSubs((now) => ({ ...now, [g]: value }));
    setTab(g);
  };
  // Kept here: search and sort survive opening a champion and leaving the tab.
  const [browse, setBrowse] = useState(initialBrowse);
  // A champion's page takes the sub-tabs' room; the tour needs them, so it goes back to the list.
  const champion = sub === "browse" && browse.open !== null && !tour;
  return (
    <>
    <Window
      variant="lobby"
      header={<Header state={state} />}
      band={
        <>
          <Segmented<MainTab>
            value={shown}
            onChange={setTab}
            options={[
              ...(preview ? [{ value: "suggestion" as const, label: t("queue.tab") }] : []),
              { value: "last", label: t("tabs.last"), tour: "tab-last" },
              { value: "me", label: t("tabs.me"), tour: "tab-me" },
              { value: "champions", label: t("tabs.champions"), tour: "tab-champions" },
            ]}
          />
          {group && sub && !champion && (
            <div className="subtabs">
              <Pills label={t(`tabs.${group}`)} options={SUB_TABS[group].map((value) => ({ value, label: t(`tabs.${value}`), tour: `subtab-${value}` }))} value={sub} onChange={(value) => openSub(group, value)} />
            </div>
          )}
        </>
      }
      footer={<AccountFooter state={state} onHowItWorks={onHowItWorks} />}
    >
      <Notices state={state} extra={state.roles.length || LOOK_UP_TABS.includes(sub) ? null : !needsClient(state.status) ? t("lobby.noDraft") : shown === "last" || sub === "new" ? t("profile.openClient") : null} />
      <SessionNotice state={state} />
      {shown === "suggestion" && preview ? (
        <Suggestion state={state} preview={preview} />
      ) : sub ? (
        <SubScreen sub={sub} state={state} browse={tour ? { ...browse, open: null } : browse} onBrowse={setBrowse} onNewChamps={() => openSub("champions", "new")} />
      ) : (
        <LastGame state={state} />
      )}
    </Window>
    {tour && <LobbyTour steps={steps} run={tour.run} onRun={tour.onRun} onClose={tour.onClose} />}
    </>
  );
}

/** What a sub-tab shows. */
function SubScreen({ sub, state, browse, onBrowse, onNewChamps }: { sub: SubTab; state: ViewState; browse: BrowseState; onBrowse: (next: BrowseState) => void; onNewChamps: () => void }) {
  if (sub === "style") return <Style state={state} />;
  if (sub === "month") return <Month state={state} />;
  if (sub === "my-games") return <MyGames state={state} />;
  if (sub === "browse") return <Browse state={state} browse={browse} onBrowse={onBrowse} />;
  if (sub === "pool") return <Pool state={state} onNewChamps={onNewChamps} />;
  return <NewChamps state={state} />;
}

/** A break suggestion after a losing streak or a long session, until the session is over. */
function SessionNotice({ state }: { state: ViewState }) {
  const now = useNow(60_000);
  const s = state.session;
  if (!s || now > s.until) return null;
  return (
    <div className="notices">
      <Notice tone="info">
        {s.text}
        {s.record && <span className="caption block">{s.record}</span>}
      </Notice>
    </div>
  );
}
