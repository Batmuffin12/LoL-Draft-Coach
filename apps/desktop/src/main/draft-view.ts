import type { ChampionId, ChampionInfo, DraftSlot, DraftState } from "@ldc/shared";
import type { ChampView, DraftView, SlotView } from "../shared/view";

export type ChampionLookup = (id: ChampionId) => ChampionInfo | undefined;

export function champView(id: ChampionId, lookup: ChampionLookup): ChampView | null {
  if (!id) return null;
  const c = lookup(id);
  return c ? { id, name: c.name, iconUrl: c.iconUrl } : { id, name: `#${id}`, iconUrl: null };
}

/** Builds what the panel shows from a sanitised draft. */
export function toDraftView(draft: DraftState, lookup: ChampionLookup, now: number = Date.now()): DraftView {
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
    receivedAt: now,
    myTeam: draft.myTeam.map(slot),
    theirTeam: draft.theirTeam.map(slot),
    myBans: bans(draft.myBans),
    theirBans: bans(draft.theirBans),
    localAction,
  };
}
