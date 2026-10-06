import { useEffect, useState } from "react";
import type { DraftView, ViewState } from "../../shared/view";
import { BanList } from "../components/BanList";
import { DraftBoard } from "../components/DraftBoard";
import { PhaseBar } from "../components/PhaseBar";
import { PickList } from "../components/PickList";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { positionLabel } from "../format";
import { useNow } from "../hooks";
import { Header, Notices } from "./common";
import { LoadoutBody, LoadoutSource } from "./LockedInScreen";

/** The call when it isn't your turn: who is acting, from the seats (no names). */
function waitingText(draft: DraftView): string {
  const acting = (slots: DraftView["myTeam"]) => slots.find((s) => s.actingType)?.actingType ?? null;
  const ally = acting(draft.myTeam);
  const enemy = acting(draft.theirTeam);
  const verb = (type: string) => (type === "ban" ? "banning" : "picking");
  if (ally) return `Your team is ${verb(ally)}`;
  if (enemy) return `They are ${verb(enemy)}`;
  return "Waiting";
}

/** The one draft fact the advice depends on, in the phase band. */
function context(state: ViewState, banning: boolean): string | null {
  const role = state.pickRole ? positionLabel(state.pickRole) : null;
  if (banning) {
    if (state.hoverBans) return `Hovering ${state.hoverBans.champion.name}${role ? ` for ${role.toLowerCase()}` : ""}`;
    return role;
  }
  const lane = state.laneOpponent;
  if (!lane) return role;
  return `${positionLabel(lane.role)} · ${lane.champion ? `against ${lane.champion.name}` : `their ${lane.role} not shown yet`}`;
}

type PickTab = "picks" | "runes" | "build";

/** Champ select: the ban screen on your ban turn, otherwise the pick screen. Fits 720px without scrolling. */
export function ChampSelectScreen({ state, draft }: { state: ViewState; draft: DraftView }) {
  const now = useNow(250);
  const [tab, setTab] = useState<PickTab>("picks");
  const banning = state.bans.length > 0 || draft.localAction === "ban";
  const hover = !banning && state.hoverPick?.loadout ? state.hoverPick : null;
  // Back to the picks when the hovered champion goes away.
  useEffect(() => {
    if (!hover) setTab("picks");
  }, [hover]);
  const secondsLeft = Math.max(0, draft.timeLeftMs - (now - draft.receivedAt)) / 1000;

  const phase = (
    <PhaseBar
      timerPhase={draft.timerPhase}
      localAction={draft.localAction}
      secondsLeft={secondsLeft}
      totalSeconds={draft.totalSeconds}
      waitingText={waitingText(draft)}
      context={context(state, banning)}
    />
  );
  const band = hover ? (
    <>
      {phase}
      <Segmented<PickTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "picks", label: "Picks" },
          { value: "runes", label: `${hover.champion.name} runes` },
          { value: "build", label: "Build" },
        ]}
      />
    </>
  ) : (
    phase
  );
  const showLoadout = hover && tab !== "picks";
  const footer = showLoadout ? (
    <LoadoutSource pick={hover} />
  ) : (
    <span className="micro">{banning ? "Suggestions only. You choose your ban." : "Suggestions only. You choose and lock your champion."}</span>
  );
  const profile = state.status.profile;
  return (
    <Window header={<Header state={state} />} band={band} footer={footer}>
      <Notices state={state} />
      {showLoadout ? (
        <LoadoutBody pick={hover} tab={tab === "build" ? "build" : "runes"} />
      ) : banning ? (
        <BanList bans={state.bans} hover={state.hoverBans} />
      ) : (
        <PickList picks={state.picks} advice={state.pickAdvice} emptyText={profile.state === "loading" ? "Suggestions appear once your match history is loaded." : undefined} />
      )}
      {!state.docked && (
        <Section title="Draft" gold={false}>
          <DraftBoard draft={draft} />
        </Section>
      )}
    </Window>
  );
}
