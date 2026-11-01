import { useEffect, useState } from "react";
import type { DraftView, ViewState } from "../../shared/view";
import { BanTable, type BanRow } from "../components/BanTable";
import { ConfidenceChip } from "../components/Chip";
import { DraftBoard } from "../components/DraftBoard";
import { Facts } from "../components/Facts";
import { PhaseBar } from "../components/PhaseBar";
import { OtherPicks, SuggestedPick } from "../components/SuggestedPick";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Window } from "../components/Window";
import { noBansKey, noPicksKey, positionLabel, roleName, t } from "../format";
import { useFitLevel, useNow } from "../hooks";
import type { RuneChoice } from "../rune-choice";
import { Header, Notices } from "./common";
import { LoadoutBody, LoadoutFooter } from "./LockedInScreen";

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
/** The suggested pick and the three under it. */
const PICKS = 4;
/** Reason lines on the card at most; fewer when the hover tabs show, or when the draft notes and alternatives leave no room. */
const REASONS = 5;

function banRows(state: ViewState): BanRow[] {
  const hover = (state.hoverBans?.bans ?? []).map((b) => ({ ...b, forHover: true }));
  return [...state.bans, ...hover].slice(0, BAN_ROWS);
}

/** Champ select: the ban screen on your ban turn, otherwise the pick screen. Fits 720px without scrolling. */
export function ChampSelectScreen({ state, draft, runes }: { state: ViewState; draft: DraftView; runes: RuneChoice }) {
  const now = useNow(250);
  const [tab, setTab] = useState<PickTab>("picks");
  const [sel, setSel] = useState(0);
  // A new #1 (the draft moved on) is selected again.
  const firstId = state.picks[0]?.champion.id;
  useEffect(() => setSel(0), [firstId]);
  const banning = state.bans.length > 0 || draft.localAction === "ban";
  // Drops reason lines one by one until the picks fit 720px, wherever the room went (undocked, the board may scroll).
  const fitLevel = useFitLevel(`${firstId}-${sel}-${banning}`, REASONS - 1);
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
          { value: "runes", label: "Runes" },
          { value: "build", label: "Build" },
        ]}
      />
    </>
  ) : (
    phase
  );
  const showLoadout = hover && tab !== "picks";
  const footer = showLoadout ? (
    <LoadoutFooter pick={hover} runes={runes} />
  ) : (
    <span className="micro">{banning ? "Suggestions only. You choose your ban." : "Suggestions only. You choose and lock your champion."}</span>
  );
  const picks = state.picks.slice(0, PICKS);
  const cur = picks[sel] ?? picks[0];
  const at = cur ? picks.indexOf(cur) : -1;
  const theirTeam = state.enemyNotes.length ? { label: t("pick.theirTeam"), items: state.enemyNotes.map((text) => ({ text })) } : null;
  const notes = [state.filledNote, theirTeam].filter((row) => row != null);
  const record = cur ? (state.roles.find((r) => r.role === state.pickRole)?.pool.find((c) => c.champion.id === cur.champion.id) ?? null) : null;
  return (
    <Window header={<Header state={state} />} band={band} footer={footer}>
      <Notices state={state} />
      {showLoadout ? (
        <LoadoutBody pick={hover} tab={tab === "build" ? "build" : "runes"} runes={runes} />
      ) : banning ? (
        <Section title="Suggested bans">
          {state.bans.length > 0 || state.hoverBans?.bans.length ? <BanTable bans={banRows(state)} /> : <p className="caption">{t(noBansKey(state))}</p>}
        </Section>
      ) : (
        <>
          <Section title={t("pick.head")} aside={picks.length > 0 && <ConfidenceChip confidence={state.pickAdvice.confidence} />}>
            {notes.length > 0 && <Facts rows={notes} flow />}
            {cur ? (
              <SuggestedPick pick={cur} first={at === 0} whyNot={state.pickAdvice.whyNot} record={record} maxReasons={Math.max(1, REASONS - (hover ? 1 : 0) - (state.docked ? fitLevel : 0))} />
            ) : (
              <p className="caption">{t(noPicksKey(state))}</p>
            )}
          </Section>
          {cur && picks.length > 1 && (
            <Section title={t("pick.ifNot", { champion: cur.champion.name })} gold={false}>
              <OtherPicks picks={picks.map((pick, index) => ({ pick, index })).filter((p) => p.index !== at)} onSelect={setSel} />
            </Section>
          )}
        </>
      )}
      {!state.docked && (
        <Section title="Draft" gold={false}>
          <DraftBoard draft={draft} />
        </Section>
      )}
    </Window>
  );
}
