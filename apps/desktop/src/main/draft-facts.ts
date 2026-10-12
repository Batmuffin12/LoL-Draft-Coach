import { draftRole, filledRole, placeDraft, weightsForBand, type ChampionAttributes, type ComfortStats, type EngineConfig, type LiveInput, type MetaIndex, type PlayerGame, type RecommendInput } from "@ldc/engine";
import { unavailableChampions, type LobbyRoles } from "@ldc/lcu";
import type { ChampionId, DraftState, Position, RankBandId, Reason, UserMatch } from "@ldc/shared";

/** Facts read off a sanitised draft (and your own games in it), for the coach's advice. Pure. */

/** A champ select with only you in it, at a position: a blind pick, to rank your pool before the queue pops. */
export function blindDraft(position: Position): DraftState {
  return {
    timerPhase: "PLANNING",
    timeLeftMs: 0,
    isCustomGame: false,
    localCellId: 0,
    myTeam: [{ cellId: 0, championId: 0, pickIntentId: 0, position, isLocalPlayer: true }],
    theirTeam: [],
    myBans: [],
    theirBans: [],
    actions: [],
  };
}

/** The champion the local player has locked in (their pick action is completed), or null. */
export function lockedPick(draft: DraftState): ChampionId | null {
  const action = draft.actions.find((a) => a.type === "pick" && a.actorCellId === draft.localCellId && a.completed && a.championId > 0);
  if (action) return action.championId;
  // After the pick phase (finalization), the seat's champion is final even if actions are trimmed.
  const me = draft.myTeam.find((s) => s.isLocalPlayer);
  return draft.timerPhase === "FINALIZATION" && me && me.championId > 0 ? me.championId : null;
}

/**
 * The enemy most likely in your lane, or null before they pick. The client doesn't say enemy
 * roles: with the band's meta, the engine assigns them (draft-roles); without it, only an enemy
 * seat that shows your position counts.
 */
export function laneOpponent(draft: DraftState, role: Position, index: MetaIndex | null): ChampionId | null {
  if (index) return placeDraft(draft, index, role).enemies.find((e) => e.role === role)?.championId ?? null;
  return draft.theirTeam.find((s) => s.position === role && s.championId > 0)?.championId ?? null;
}

/** The local player is banning right now, or the draft is in the planning phase before bans. */
export function banningNow(draft: DraftState): boolean {
  if (draft.timerPhase === "PLANNING") return true;
  return draft.actions.some((a) => a.inProgress && !a.completed && a.type === "ban" && a.actorCellId === draft.localCellId);
}

/** Your own games on this champion in this role against `enemy` (your lane opponent's champion); none: nothing to say. */
export function recordVsLane(matches: UserMatch[], championId: ChampionId, role: Position | null, enemy: ChampionId | null): Reason[] {
  if (!enemy || !role) return [];
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const me = m.match.participants[m.me];
    if (!me || me.championId !== championId || me.position !== role) continue;
    if (!m.match.participants.some((p) => p.teamId !== me.teamId && p.position === role && p.championId === enemy)) continue;
    if (me.win) wins++;
    else losses++;
  }
  return wins + losses ? [{ id: "plan.record", slots: { enemy, wins, losses } }] : [];
}

/**
 * What the engine scores a draft with: your role in it, the input from your own data, whether
 * you're filled into a role you rarely play, and (with the band's meta loaded) the live input.
 * While your history loads, comfort is empty and nobody is "filled".
 */
export function draftScoring(o: {
  draft: DraftState;
  games: PlayerGame[];
  loading: boolean;
  pickable: ChampionId[];
  comfortFor: (role: Position | null) => Map<ChampionId, ComfortStats>;
  attributes: Map<ChampionId, ChampionAttributes>;
  intendedPositions: Map<ChampionId, Position[]>;
  band: RankBandId;
  engine: EngineConfig;
  index: MetaIndex | null;
}): { role: Position | null; input: RecommendInput; filled: ReturnType<typeof filledRole>; live: LiveInput | null } {
  const role = draftRole(o.draft, o.games);
  const input = {
    draft: o.draft,
    pickable: o.pickable,
    unavailable: unavailableChampions(o.draft),
    comfort: o.loading ? new Map<ChampionId, ComfortStats>() : o.comfortFor(role),
    attributes: o.attributes,
    intendedPositions: o.intendedPositions,
    role,
    weights: weightsForBand(o.band, o.engine),
    config: o.engine,
  };
  // Live meta (engine v2) when the band's snapshot is loaded; the player's own data otherwise.
  // Filled into a role you rarely play: picks lean harder on what you know, and the panel says so.
  const filled = o.loading ? null : filledRole(o.draft, o.games, o.engine.rating.personal.offRole);
  const live = o.index ? { ...input, index: o.index, band: o.band, filled: filled !== null } : null;
  return { role, input, filled, live };
}

/** We coach this champ select: a custom game, an unknown queue, or a queue in config (app.supportedQueues). */
export function queueSupported(draft: DraftState | null, queueId: number | null, supported: number[]): boolean {
  return draft?.isCustomGame === true || queueId === null || supported.includes(queueId);
}

/** Client phases in the lobby before a game: your queued roles get a preview of picks. */
const QUEUE_PHASES = new Set(["Lobby", "Matchmaking", "ReadyCheck"]);

/** In a lobby (before champ select) with roles chosen, for a queue we coach (or a custom game). */
export function queuePreviewWanted(lobby: LobbyRoles, phase: string, supportedQueues: number[]): boolean {
  const supported = lobby.isCustom || (lobby.queueId != null && supportedQueues.includes(lobby.queueId));
  return lobby.positions.length > 0 && QUEUE_PHASES.has(phase) && supported;
}
