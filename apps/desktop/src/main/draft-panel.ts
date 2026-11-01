import type { PickAdvice, Position, DraftState } from "@ldc/shared";
import type { ImportLine, MyPickView, ViewState } from "../shared/view";
import { adviceNotes, pickViews } from "./role-view";
import { banViews, type draftNotes, type PickCardContext } from "./pick-card";
import { banningNow } from "./draft-facts";

/**
 * What champ select puts on the panel at each stage. Pure: the coach decides the stage and keeps the
 * state. Each stage sets every field, so nothing from the stage before stays on screen.
 */

type Notes = ReturnType<typeof draftNotes>;
type Bans = Pick<ViewState, "bans" | "hoverBans">;

const noAdvice = (): ViewState["pickAdvice"] => ({ whyNot: null, confidence: null });

/** Suggested bans while bans are on, with live meta. */
export function bansNow(ctx: PickCardContext): Bans {
  return ctx.live !== null && banningNow(ctx.draft) ? banViews(ctx.live, ctx) : { bans: [], hoverBans: null };
}

/** The champion you're hovering or have selected, not locked in yet (0: none). */
export function pendingPick(draft: DraftState): number {
  const me = draft.myTeam.find((s) => s.isLocalPlayer);
  return me ? me.championId || me.pickIntentId : 0;
}

/** Locked in: no more suggestions; your own pick (and, with live meta, how it looks in this draft). */
export function lockedPanel(role: Position | null, notes: Notes, myPick: MyPickView): Partial<ViewState> {
  return { picks: [], bans: [], hoverBans: null, hoverPick: null, pickAdvice: noAdvice(), pickRole: role, laneOpponent: notes.lane, enemyNotes: notes.enemyNotes, filledNote: null, myPick };
}

/** Your history is still loading: bans from the live meta alone. */
export function loadingPanel(role: Position | null, notes: Notes, bans: Bans): Partial<ViewState> {
  return { picks: [], pickAdvice: noAdvice(), ...bans, myPick: null, hoverPick: null, pickRole: role, laneOpponent: notes.lane, enemyNotes: notes.enemyNotes, filledNote: null };
}

/** Your suggestions, and the hovered champion's loadout when it has one. */
export function suggestionPanel(advice: PickAdvice, role: Position | null, notes: Notes, bans: Bans, hoverCard: MyPickView | null, ctx: PickCardContext): Partial<ViewState> {
  const pickAdvice = { ...adviceNotes(advice, ctx.say), minGames: ctx.config.engine.rating.minGames };
  return { picks: pickViews(advice.picks, ctx.lookup, ctx.say), pickAdvice, ...bans, myPick: null, hoverPick: hoverCard?.loadout ? hoverCard : null, pickRole: role, laneOpponent: notes.lane, enemyNotes: notes.enemyNotes, filledNote: notes.filledNote };
}

/** Out of champ select (or no history, or a queue we don't coach). */
export function noDraftPanel(kept: MyPickView | null, pickRole: Position | null): Partial<ViewState> {
  return { picks: [], bans: [], hoverBans: null, hoverPick: null, myPick: kept, pickAdvice: noAdvice(), pickRole, laneOpponent: null, enemyNotes: [], filledNote: null };
}

/** Your pick stays while its game is on, with its loadout. Import only works in champ select, and the card says so (`hint`, when there was a loadout to import). */
export function keptCard(pick: MyPickView | null, hint: ImportLine[]): MyPickView | null {
  return pick && { ...pick, importLines: pick.loadout ? hint : [], loadout: pick.loadout && { ...pick.loadout, canImport: false } };
}
