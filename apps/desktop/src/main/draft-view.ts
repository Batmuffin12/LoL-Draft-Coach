import type { ChampionId, ChampionInfo, DraftSlot, DraftState } from "@ldc/shared";
import type { ChampView, DraftView, SlotView } from "../shared/view";

export type ChampionLookup = (id: ChampionId) => ChampionInfo | undefined;

export function champView(id: ChampionId, lookup: ChampionLookup): ChampView | null {
  if (!id) return null;
  const c = lookup(id);
  return c ? { id, name: c.name, iconUrl: c.iconUrl } : { id, name: `#${id}`, iconUrl: null };
}

/** Builds what the panel shows from a sanitised draft. */
export function toDraftView(draft: DraftState, lookup: ChampionLookup, now: number = Date.now(), phaseMs: number = draft.timeLeftMs): DraftView {
  const acting = new Map(draft.actions.filter((a) => a.inProgress && !a.completed).map((a) => [a.actorCellId, a.type]));
  const slot = (s: DraftSlot): SlotView => ({
    cellId: s.cellId,
    position: s.position,
    champion: champView(s.championId, lookup),
    hover: s.championId ? null : champView(s.pickIntentId, lookup),
    isLocalPlayer: s.isLocalPlayer,
    actingType: acting.get(s.cellId) ?? null,
  });
  const localAction =
    draft.actions.find((a) => a.actorCellId === draft.localCellId && a.inProgress && !a.completed)?.type ?? null;
  const bans = (ids: ChampionId[]) => ids.map((id) => champView(id, lookup)).filter((c): c is ChampView => c !== null);

  return {
    timerPhase: draft.timerPhase,
    timeLeftMs: draft.timeLeftMs,
    totalSeconds: Math.round(Math.max(phaseMs, draft.timeLeftMs) / 1000),
    receivedAt: now,
    myTeam: draft.myTeam.map(slot),
    theirTeam: draft.theirTeam.map(slot),
    myBans: bans(draft.myBans),
    theirBans: bans(draft.theirBans),
    localAction,
  };
}

/**
 * Remembers how long the current phase is: the first timeLeftMs seen in it. A phase is the
 * timer phase plus the actions in progress (each pick or ban turn has its own timer); a timer
 * that goes up (the client reset it) starts a new length too.
 */
export class PhaseLength {
  private key: string | null = null;
  private totalMs = 0;

  observe(draft: DraftState): number {
    const inProgress = draft.actions.filter((a) => a.inProgress && !a.completed).map((a) => a.id);
    const key = `${draft.timerPhase}:${inProgress.join(",")}`;
    if (key !== this.key || draft.timeLeftMs > this.totalMs) {
      this.key = key;
      this.totalMs = draft.timeLeftMs;
    }
    return this.totalMs;
  }

  reset(): void {
    this.key = null;
    this.totalMs = 0;
  }
}
