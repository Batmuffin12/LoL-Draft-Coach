import {
  adviseRoles,
  analyzePool,
  focusAfterLastGame,
  learningPlan,
  mainRole,
  monthlyReport,
  recommendNewChampions,
  sideSplit,
  type ChampionAttributes,
  type ComfortStats,
  type GrowthFocus,
  type MetaIndex,
  type RolePool,
} from "@ldc/engine";
import type { AdviceRecord, ChampionId, Position, RankBandId } from "@ldc/shared";
import type { NewChampRoleView, ViewState } from "../shared/view";
import type { LoadedConfig } from "./config";
import { champView, type ChampionLookup } from "./draft-view";
import { growthFocusView } from "./focus-view";
import { lastGameView } from "./last-game-view";
import { monthView } from "./month-view";
import { newChampsView } from "./newchamps-view";
import type { PersonalProfile } from "./profile";
import { roleView } from "./role-view";
import { playstyleViews, sideView } from "./style-view";

/**
 * The lobby's tabs, worked out from your games and the band's meta: your goal, last game, month, style,
 * pool and champions to learn. Pure: everything comes in as arguments; the coach keeps the state.
 */

export interface LobbyViewContext {
  config: LoadedConfig;
  band: RankBandId;
  index: MetaIndex | null;
  growth: GrowthFocus | null;
  lookup: ChampionLookup;
  positionLabel: (role: string) => string;
  minGames: number;
}

const referencesOf = (c: LobbyViewContext) => (role: Position) => c.index?.snapshot.references[role];

/** Your growth focus: on the role of your last game (each role has its own goals), even from your first games there. */
export function growthFor(profile: PersonalProfile, c: LobbyViewContext): GrowthFocus | null {
  return focusAfterLastGame(profile.matches, mainRole(profile.games), c.config.engine, referencesOf(c));
}

/** The Last game tab's goal. */
export function focusView(c: LobbyViewContext): ViewState["focus"] {
  const championName = (id: number) => c.lookup(id)?.name ?? `#${id}`;
  return growthFocusView(c.growth, { config: c.config, band: c.index ? c.band : null, championName, positionLabel: c.positionLabel });
}

/** The monthly report: your last month against the month before, from your own games. */
export function monthFor(profile: PersonalProfile, now: number, c: LobbyViewContext): ViewState["month"] {
  const { config, lookup } = c;
  const report = monthlyReport(profile.matches, now, config.engine, { bands: config.bands, rankHistory: profile.rankHistory, references: referencesOf(c) });
  return monthView(report, { explain: config.explain, champion: (id) => champView(id, lookup), positionLabel: c.positionLabel, growth: c.growth, minGames: c.minGames });
}

/** The post-game card: your newest game, with what the coach showed for it when it was there. */
export function lastGameFor(advice: AdviceRecord | undefined, profile: PersonalProfile | null, c: Pick<LobbyViewContext, "config" | "growth" | "lookup">): ViewState["lastGame"] {
  const { explain, engine } = c.config;
  return lastGameView(advice, profile?.matches ?? [], c.growth, { explain, minDeltaWin: engine.rating.explain.minDeltaWin, lookup: c.lookup });
}

/** Playstyle per role (lobby Style tab) and your side split. */
export function styleFor(profile: PersonalProfile, now: number, c: LobbyViewContext): Pick<ViewState, "playstyle" | "side"> {
  const { engine, explain } = c.config;
  const playstyle = playstyleViews(profile.matches, now, engine, explain, referencesOf(c), (id) => c.lookup(id)?.tags);
  return { playstyle, side: engine.style ? sideView(sideSplit(profile.matches, engine.style.side), explain) : null };
}

export interface RoleAdviceContext extends LobbyViewContext {
  now: number;
  attributes: () => Map<ChampionId, ChampionAttributes>;
  intendedPositions: Map<ChampionId, Position[]>;
  owned: Set<ChampionId> | null;
  comfortFor: (role: Position) => Map<ChampionId, ComfortStats>;
  itemName: (id: number) => string;
  completedItems: () => ReadonlySet<number> | undefined;
}

/** The Pool tab and the Try new tab, per role. */
export function roleAdvice(profile: PersonalProfile, c: RoleAdviceContext): Pick<ViewState, "roles" | "newChamps"> {
  const { engine, explain } = c.config;
  const newChamps: NewChampRoleView[] = [];
  const roles = adviseRoles(profile.games, profile.masteries, c.now, engine, c.intendedPositions, c.attributes()).map((r) => {
    const pool = r.enoughData
      ? analyzePool({
          role: r.role,
          comfort: c.comfortFor(r.role),
          masteries: profile.masteries,
          matches: profile.matches,
          attributes: c.attributes(),
          intendedPositions: c.intendedPositions,
          now: c.now,
          config: engine,
          ...(c.index ? { rolePicks: c.index.championsIn(r.role) } : {}),
        })
      : null;
    if (pool && c.index) newChamps.push(newChampsFor(r.role, pool, c.index, profile, c));
    return roleView(r, pool, { attributes: c.attributes(), coverage: engine.pool.coverage, templates: explain.templates, lookup: c.lookup });
  });
  return { roles, newChamps };
}

/** The New tab for one role: champions to learn there, each with its plan. */
function newChampsFor(role: Position, pool: RolePool, index: MetaIndex, profile: PersonalProfile, c: RoleAdviceContext): NewChampRoleView {
  const { engine, explain } = c.config;
  const { lookup, growth } = c;
  const played = new Map<ChampionId, number>();
  for (const g of profile.games) if (g.position === role) played.set(g.championId, (played.get(g.championId) ?? 0) + 1);
  const advice = recommendNewChampions({
    role,
    pool,
    playedInRole: played,
    masteries: profile.masteries,
    index,
    champions: (id) => lookup(id),
    attributes: c.attributes(),
    owned: c.owned,
    config: engine.newChamps,
    coverage: engine.pool.coverage,
  });
  return newChampsView(advice, {
    explain,
    champion: (id) => champView(id, lookup),
    championName: (id) => lookup(id)?.name ?? `#${id}`,
    itemName: c.itemName,
    planGames: engine.newChamps.planGames,
    learn: { profile: engine.newChamps.learn.profile, laneGoldEven: engine.rating.explain.laneGoldGap },
    blockGames: engine.newChamps.learn.blockGames,
    plan: (id) =>
      learningPlan({
        championId: id,
        role,
        matches: profile.matches,
        index,
        champion: lookup(id),
        goal: growth?.focus ? { role: growth.role, ...growth.focus } : null,
        completed: c.completedItems(),
        config: engine,
      }),
  });
}
