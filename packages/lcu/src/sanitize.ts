import { normalizePosition, type DraftSlot, type DraftState } from "@ldc/shared";
import type { ChampSelectSession } from "./schemas";

/**
 * Compliance boundary: converts a raw champ select session into a DraftState that
 * holds champions and draft structure only. Fields are copied from an allowlist, so
 * names, PUUIDs, summoner ids, ranks or anything added to the payload later can never
 * reach the engine or the UI.
 */
export function sanitizeChampSelect(session: ChampSelectSession): DraftState {
  const localCellId = session.localPlayerCellId;
  const toSlot = (p: ChampSelectSession["myTeam"][number]): DraftSlot => ({
    cellId: p.cellId,
    championId: p.championId,
    pickIntentId: p.championPickIntent,
    position: normalizePosition(p.assignedPosition),
    isLocalPlayer: p.cellId === localCellId,
  });

  return {
    timerPhase: session.timer.phase,
    timeLeftMs: session.timer.adjustedTimeLeftInPhase,
    isCustomGame: session.isCustomGame,
    localCellId,
    myTeam: session.myTeam.map(toSlot),
    theirTeam: session.theirTeam.map(toSlot),
    myBans: [...session.bans.myTeamBans],
    theirBans: [...session.bans.theirTeamBans],
    actions: session.actions.flat().map((a) => ({
      id: a.id,
      type: a.type,
      actorCellId: a.actorCellId,
      championId: a.championId,
      completed: a.completed,
      inProgress: a.isInProgress,
      isAllyAction: a.isAllyAction,
    })),
  };
}

/** Champions that can no longer be picked: banned or picked/hovered-and-locked by anyone. */
export function unavailableChampions(draft: DraftState): Set<number> {
  const out = new Set<number>([...draft.myBans, ...draft.theirBans]);
  for (const a of draft.actions) if (a.completed && a.championId > 0) out.add(a.championId);
  for (const s of [...draft.myTeam, ...draft.theirTeam]) if (s.championId > 0 && !s.isLocalPlayer) out.add(s.championId);
  out.delete(0);
  return out;
}
