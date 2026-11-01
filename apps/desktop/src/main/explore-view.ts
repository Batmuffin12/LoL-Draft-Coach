import { browseLoadout, completedBoots, deltaWin, type EngineConfig, type MetaIndex, type PlayerGame, type RankBandConfig } from "@ldc/engine";
import type { ChampionBuild, ChampionId, Position, RankBandId, UserMatch } from "@ldc/shared";
import type { ExploreChampionView, ExploreList, ExploreRow, MyGames, OwnRecord } from "../shared/explore";
import { MATCHUP_EVEN, type IconView, type LoadoutView, type MatchupRowView } from "../shared/view";
import { champView, type ChampionLookup } from "./draft-view";
import { browsePageViews, iconOf, toLoadoutView, type LoadoutViewDeps } from "./loadout-view";

/**
 * Looking things up yourself: the rows and pages of Champions > Browse and Me > My games, computed
 * from the snapshot and your games on the PC when the panel asks. Pure, like the other view modules.
 */

/** Matchup rows each way that fit the screen. */
const MATCHUP_ROWS = 4;

/** The last result, kept while its inputs are the same objects (a list is worked out once per snapshot and history). */
export function memoByInputs<T>(): (inputs: readonly unknown[], make: () => T) => T {
  let last: { inputs: readonly unknown[]; value: T } | null = null;
  return (inputs, make) => {
    if (last?.inputs.length !== inputs.length || !inputs.every((x, i) => x === last!.inputs[i])) last = { inputs, value: make() };
    return last.value;
  };
}

/** Roles in the order the explain config lists them (the client's), then any other the data has. */
export function orderRoles(present: Iterable<string>, labels: Record<string, string>): string[] {
  const have = new Set([...present].filter(Boolean));
  return [...Object.keys(labels).filter((r) => have.has(r)), ...[...have].filter((r) => !(r in labels))];
}

const recordKey = (id: ChampionId, role: Position) => `${id}|${role}`;

function ownRecords(games: readonly PlayerGame[]): Map<string, OwnRecord> {
  const by = new Map<string, OwnRecord>();
  for (const g of games) {
    const k = recordKey(g.championId, g.position);
    const r = by.get(k) ?? { games: 0, wins: 0 };
    r.games += 1;
    r.wins += Number(g.win);
    by.set(k, r);
  }
  return by;
}

const rateOf = (s: { games: number; wins: number }) => (s.games > 0 ? s.wins / s.games : null);

/** The rank band's name from the config; the id only if the config doesn't know it. */
const rankName = (bands: RankBandConfig, band: RankBandId) => bands.bands.find((b) => b.id === band)?.name ?? String(band);

/** A champion-role's three rates, in the band. A role without games has no pick rate (the index would say 0). */
function rates(index: MetaIndex, id: ChampionId, role: Position): Pick<ExploreRow, "winRate" | "pickRate" | "banRate"> {
  return {
    winRate: rateOf(index.champion(id, role)),
    pickRate: (index.snapshot.roleGames[role] ?? 0) > 0 ? index.pickRate(id, role) : null,
    banRate: index.banRate(id)?.rate ?? null,
  };
}

export interface ExploreListDeps {
  games: readonly PlayerGame[];
  lookup: ChampionLookup;
  bands: RankBandConfig;
  roleLabels: Record<string, string>;
}

/** One row per champion-role in the snapshot, unsorted (the panel sorts and filters), with your games on each. */
export function exploreListView(index: MetaIndex, deps: ExploreListDeps): ExploreList {
  const { snapshot } = index;
  const own = ownRecords(deps.games);
  const rows: ExploreRow[] = snapshot.champions
    .filter((c) => c.role && c.games > 0)
    .map((c) => {
      const champ = champView(c.championId, deps.lookup)!;
      return { id: c.championId, name: champ.name, iconUrl: champ.iconUrl, role: c.role, games: c.n, ...rates(index, c.championId, c.role), yours: own.get(recordKey(c.championId, c.role)) ?? null };
    });
  return {
    rank: rankName(deps.bands, snapshot.band),
    patch: snapshot.patch,
    matches: snapshot.matches,
    roles: orderRoles(rows.map((r) => r.role), deps.roleLabels),
    hasBans: index.banRate(0) !== null,
    rows,
  };
}

/** The lane opponents from at least `minGames` games: the best and the worst against what the two champions' usual win rates predict. */
export function browseMatchups(index: MetaIndex, id: ChampionId, role: Position, lookup: ChampionLookup, minGames: number): ExploreChampionView["matchups"] {
  const rows: MatchupRowView[] = [...new Set(index.opponentsOf(id, role))]
    .map((enemy) => ({ enemy, stat: index.matchup(id, role, enemy, role) }))
    .filter(({ stat }) => stat.n >= minGames)
    .map(({ enemy, stat }) => ({ champion: champView(enemy, lookup), role, lane: false, winRate: rateOf(stat), delta: deltaWin(index.matchupDelta(id, role, enemy, role).delta), games: stat.n }));
  const byDelta = rows.sort((a, b) => b.delta! - a.delta! || b.games - a.games);
  // A pair that plays about even is neither: the table would call it "Even" under "Worst against".
  return { best: byDelta.filter((r) => r.delta! > MATCHUP_EVEN).slice(0, MATCHUP_ROWS), worst: byDelta.filter((r) => r.delta! < -MATCHUP_EVEN).reverse().slice(0, MATCHUP_ROWS) };
}

/** The most taken full path of completed items; never its win rate, which would be a raw item win rate. */
function corePath(build: ChampionBuild, item: (id: number) => IconView): ExploreChampionView["core"] {
  const path = build.core.filter((c) => c.items.length >= 3).sort((a, b) => b.n - a.n)[0];
  if (!path) return null;
  return { items: path.items.map(item), share: path.n / Math.max(1, build.timelineN), games: path.n };
}

/** Items carry pick rate and win added only: the starting items' raw win rate stays out of the view (shared ItemSlotStat rule). */
function withoutItemWinRates(l: LoadoutView): LoadoutView {
  return l.starting ? { ...l, starting: { ...l.starting, winRate: null } } : l;
}

export interface ExploreChampionDeps extends Omit<LoadoutViewDeps, "canImport" | "band" | "spikeSlots"> {
  games: readonly PlayerGame[];
  lookup: ChampionLookup;
  loadout: EngineConfig["loadout"];
  minGames: number;
  buildsFrom?: (itemId: number) => number[];
}

/** One champion in one role, looked up. Null when the snapshot has no games for it there. */
export function exploreChampionView(index: MetaIndex, id: ChampionId, role: Position, deps: ExploreChampionDeps): ExploreChampionView | null {
  const stat = index.champion(id, role);
  const champion = champView(id, deps.lookup);
  if (stat.games <= 0 || !champion) return null;
  const { snapshot } = index;
  const viewDeps: LoadoutViewDeps = { ...deps, band: snapshot.band, canImport: false };
  const boots = deps.data ? completedBoots(deps.data.itemInfo, deps.loadout.items) : new Set<number>();
  const raw = browseLoadout(snapshot, id, role, deps.loadout, boots, deps.buildsFrom);
  const build = raw ? snapshot.builds!.find((b) => b.championId === id && b.role === role)! : null;
  const cfg = deps.loadout;
  const pages = build ? [...build.pages].sort((a, b) => b.n - a.n).filter((p, i) => i === 0 || (p.n >= cfg.minGames && p.n / build.n >= cfg.minShare)) : [];
  return {
    champion,
    role,
    rank: rankName(deps.bands, snapshot.band),
    games: stat.n,
    ...rates(index, id, role),
    yours: ownRecords(deps.games).get(recordKey(id, role)) ?? null,
    pages: build ? browsePageViews(pages, build.n, build.n < cfg.solidGames, viewDeps) : [],
    loadout: raw ? withoutItemWinRates(toLoadoutView(raw, viewDeps)) : null,
    core: build ? corePath(build, (i) => iconOf(deps.data?.itemInfo, i)) : null,
    matchups: browseMatchups(index, id, role, deps.lookup, deps.minGames),
  };
}

/** Your own games, newest first: only your own seat of each match, nobody else's. */
export function myGamesView(matches: readonly UserMatch[], lookup: ChampionLookup, roleLabels: Record<string, string>): MyGames {
  const champions = new Map<ChampionId, NonNullable<ReturnType<typeof champView>>>();
  const games: MyGames["games"] = matches.flatMap(({ match, me }) => {
    const p = match.participants[me];
    if (!p) return [];
    const champ = champView(p.championId, lookup);
    if (champ && !champions.has(p.championId)) champions.set(p.championId, champ);
    return [{ matchId: match.matchId, championId: p.championId, role: p.position, win: p.win, kills: p.kills, deaths: p.deaths, assists: p.assists, cs: p.cs, durationSec: match.durationSec, endedAt: match.endedAt }];
  });
  games.sort((a, b) => b.endedAt - a.endedAt);
  return { champions: [...champions.values()], roles: orderRoles(games.map((g) => g.role), roleLabels), games };
}
