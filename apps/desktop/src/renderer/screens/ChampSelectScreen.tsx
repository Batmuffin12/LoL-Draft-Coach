import { useEffect, useState } from "react";
import type { DraftView, ViewState } from "../../shared/view";
import { BanTable, type BanRow } from "../components/BanTable";
import { ConfidenceChip } from "../components/Chip";
import { DraftBoard } from "../components/DraftBoard";
import { PhaseBar } from "../components/PhaseBar";
import { PickTable } from "../components/PickTable";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { positionLabel, roleName } from "../format";
import { useNow } from "../hooks";
import { Header, Notices } from "./common";
import { LoadoutBody, LoadoutSource } from "./LockedInScreen";

/** The call when it isn't your turn: who is acting, from the seats (no names). */
function waitingText(draft: DraftView): string {
  if (draft.timerPhase === "PLANNING") return "Bans next";
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
  return `${positionLabel(lane.role)} · ${lane.champion ? `against ${lane.champion.name}` : `their ${roleName(lane.role)} not shown yet`}`;
}

type PickTab = "picks" | "runes" | "build";

/** Ban rows that fit 720px: the suggested bans, then the ones that protect your hover fill the rest. */
const BAN_ROWS = 5;
/** Pick rows (3–4) so the selected row's reasons fit under the table. */
const PICK_ROWS = 4;

function banRows(state: ViewState): BanRow[] {
  const hover = (state.hoverBans?.bans ?? []).map((b) => ({ ...b, forHover: true }));
  return [...state.bans, ...hover].slice(0, BAN_ROWS);
}

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
        <Section title="Suggested bans">
          {state.bans.length > 0 || state.hoverBans?.bans.length ? <BanTable bans={banRows(state)} /> : <p className="caption">Ban suggestions need the live meta for your rank.</p>}
        </Section>
      ) : (
        <Section title="Suggested picks" aside={state.picks.length > 0 && <ConfidenceChip confidence={state.pickAdvice.confidence} />}>
          {state.picks.length > 0 ? (
            <PickTable picks={state.picks.slice(0, PICK_ROWS)} whyNot={state.pickAdvice.whyNot} />
          ) : (
            <p className="caption">{profile.state === "loading" ? "Suggestions appear once your match history is loaded." : "Suggestions appear during champ select."}</p>
          )}
        </Section>
      )}
      {!state.docked && (
        <Section title="Draft" gold={false}>
          <DraftBoard draft={draft} />
        </Section>
      )}
    </Window>
  );
}
