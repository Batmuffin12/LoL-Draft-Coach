import type { StaticData } from "@ldc/ddragon";
import {
  assessPick,
  completedBoots,
  completedItems,
  draftLoadout,
  powerSpikes,
  enemyTeamNotes,
  type filledRole,
  gamePlan,
  personalBuild,
  renderReason,
  suggestBans,
  suggestHoverBans,
  type LiveInput,
  type Loadout,
  type MetaIndex,
  type RankBandConfig,
} from "@ldc/engine";
import type { BanSuggestion, ChampionId, DraftState, Position, RankBandId, Reason, UserMatch } from "@ldc/shared";
import type { BanView, ChampView, MyPickView } from "../shared/view";
import type { LoadedConfig } from "./config";
import { champView, type ChampionLookup } from "./draft-view";
import { toLoadoutView } from "./loadout-view";
import { reasonView } from "./reason-view";
import { laneOpponent } from "./draft-facts";
import { banNumbers, draftMatchups } from "./stats-view";

/**
 * Champ select's cards and tables, built from the draft and the live meta: "Your pick" (how a
 * champion looks in this draft, its loadout, matchups and game plan) and the suggested bans.
 * Pure: everything comes in as arguments; the coach keeps the import state.
 */

type Say = (r: Parameters<typeof renderReason>[0]) => string;

export interface PickCardContext {
  /** The draft scored with live meta (engine v2), or null without a snapshot. */
  live: LiveInput | null;
  draft: DraftState;
  index: MetaIndex | null;
  role: Position | null;
  matches: UserMatch[];
  config: LoadedConfig;
  bands: RankBandConfig;
  band: RankBandId;
  /** Data Dragon's static data, or null before it is loaded (names fall back to ids). */
  data: StaticData | null;
  lookup: ChampionLookup;
  say: Say;
  canImport: boolean;
  perk: (id: number) => { name: string; iconUrl: string | null } | undefined;
  shardRows: number[][];
  /** Your own games on this champion in this role against your lane opponent's champion. */
  recordVsLane: (championId: ChampionId) => Reason[];
}

/** A champion's loadout in this draft (your own games fill in when your rank has too few), or null without live meta. */
export function cardLoadout(championId: ChampionId, ctx: PickCardContext): Loadout | null {
  if (!ctx.live) return null;
  const items = ctx.config.engine.loadout.items;
  const completed = ctx.data ? completedItems(ctx.data.itemInfo, items) : new Set<number>();
  const boots = ctx.data ? completedBoots(ctx.data.itemInfo, items) : new Set<number>();
  const personal = personalBuild(ctx.matches, championId, ctx.role, completed);
  const buildsFrom = (id: number) => ctx.data?.itemInfo.get(id)?.from ?? [];
  return draftLoadout(ctx.live, championId, ctx.config.engine.loadout, personal, boots, buildsFrom);
}

/** The "Your pick" card for a champion: how it looks in this draft and its loadout. */
export function pickCardView(championId: ChampionId, hovering: boolean, loadout: Loadout | null, importMessage: string | null, ctx: PickCardContext): MyPickView {
  const { live, lookup, say, config } = ctx;
  const assessed = live ? assessPick(live, championId) : null;
  const nameOf = (id: number) => lookup(id)?.name ?? `#${id}`;
  return {
    champion: champView(championId, lookup)!,
    role: ctx.role,
    expectedWin: assessed?.expectedWin ?? null,
    reasons: assessed ? assessed.reasons.map((r) => reasonView(r, say)) : [],
    loadout: loadout
      ? toLoadoutView(loadout, {
          runeMechanics: config.engine.loadout.runeMechanics,
          itemMechanics: config.engine.loadout.itemMechanics,
          data: ctx.data,
          templates: config.explain.templates,
          championName: nameOf,
          bands: ctx.bands,
          band: ctx.band,
          canImport: ctx.canImport,
          perk: ctx.perk,
          shardRows: ctx.shardRows,
          // Item slots that are a measured spike (shown only when the snapshot's spikes passed their check).
          spikeSlots: live && ctx.role ? powerSpikes(live.index, championId, ctx.role, config.engine.spikes).filter((s) => s.kind === "item").map((s) => s.at) : [],
        })
      : null,
    importMessage,
    hovering,
    matchups: ctx.index ? draftMatchups(ctx.draft, ctx.index, championId, ctx.role, lookup, config.app.sharedLanes) : null,
    plan: [...(live ? gamePlan(live, championId) : []), ...ctx.recordVsLane(championId)].map(say),
  };
}

/** The suggested bans while you ban, and the extra ones that protect the champion you hover. */
export function banViews(live: LiveInput, ctx: Pick<PickCardContext, "draft" | "role" | "config" | "lookup" | "say">): { bans: BanView[]; hoverBans: { champion: ChampView; bans: BanView[] } | null } {
  const { lookup, say } = ctx;
  const templates = ctx.config.explain.templates;
  const suggestions = suggestBans(live);
  // The ban table shows the rates in columns: its reason lines use the short ".row" wording when there is one.
  const row = (r: BanSuggestion["reasons"][number]) => say(templates[`${r.id}.row`] ? { ...r, id: `${r.id}.row` } : r);
  const toView = (b: BanSuggestion): BanView => ({ champion: champView(b.championId, lookup)!, reasons: b.reasons.map(row), ...banNumbers(live.index, b, ctx.role, ctx.config.engine.rating.bans.minPickRate) });
  // Hovering a champion before or during bans: extra bans that protect it (1 if it's already the top suggestion).
  const hovered = ctx.draft.myTeam.find((s) => s.isLocalPlayer)?.pickIntentId ?? 0;
  return {
    bans: suggestions.map(toView),
    hoverBans:
      hovered > 0
        ? {
            champion: champView(hovered, lookup)!,
            bans: suggestHoverBans(live, hovered, suggestions.map((b) => b.championId)).map(toView),
          }
        : null,
  };
}

/**
 * The draft's notes around the picks: their team in short (damage type, main engage, once two are
 * picked), who you face in lane (the client doesn't say enemy roles) and, filled into a role you
 * rarely play, a line saying so.
 */
export function draftNotes(
  draft: DraftState,
  role: Position | null,
  live: LiveInput | null,
  filled: ReturnType<typeof filledRole>,
  ctx: Pick<PickCardContext, "index" | "lookup" | "say">,
): { enemyNotes: string[]; lane: { role: Position; champion: ChampView | null } | null; filledNote: string | null } {
  const { say } = ctx;
  return {
    enemyNotes: live ? enemyTeamNotes(live).map(say) : [],
    lane: role ? { role, champion: champView(laneOpponent(draft, role, ctx.index) ?? 0, ctx.lookup) } : null,
    filledNote: filled && live ? say({ id: "picks.filled", slots: { role: filled.role, share: filled.share, games: filled.games } }) : null,
  };
}
