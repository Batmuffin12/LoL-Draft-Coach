import type { ChampView, IconView, LoadoutView, MatchupRowView, RunePageView } from "./view";

/**
 * Looking things up yourself: the band's numbers per champion and your own games. These travel over
 * a small on-demand IPC call, never in the view state (it's pushed often; see docs/perf). The
 * filters below are pure and run in the renderer, so typing in the search box never calls the main process.
 */

/** Your own games on a champion. */
export interface OwnRecord {
  games: number;
  wins: number;
}

/** One champion in one role, in the player's rank band. */
export interface ExploreRow {
  id: number;
  name: string;
  iconUrl: string | null;
  role: string;
  /** Games behind the win rate (unweighted). */
  games: number;
  winRate: number | null;
  /** Share of the role's games it's picked in; null when the snapshot has no games for the role. */
  pickRate: number | null;
  /** Share of games it's banned in, over all roles; null when the snapshot has no ban data (older snapshots). */
  banRate: number | null;
  yours: OwnRecord | null;
}

export interface ExploreList {
  /** The rank band in plain words ("Gold to Platinum"). */
  rank: string;
  patch: string | null;
  /** Matches behind the snapshot. */
  matches: number;
  /** The roles with rows, in the order the client lists them. */
  roles: string[];
  hasBans: boolean;
  rows: ExploreRow[];
}

export type ExploreSort = "winRate" | "pickRate" | "banRate" | "yours";

export interface ExploreFilter {
  search: string;
  /** "": every role. */
  role: string;
  sort: ExploreSort;
}

/** What a search compares: no case, accents, spaces or punctuation, so "kaisa" finds Kai'Sa and "dr mundo" finds Dr. Mundo. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * The rows that match, best first by the chosen number, then more games, then by name. Rows without
 * that number come last. By win rate, rows below the shared minimum come after all the others:
 * 100% from one game isn't the strongest champion.
 */
export function filterExplore(rows: readonly ExploreRow[], filter: ExploreFilter, minGames: number): ExploreRow[] {
  const query = searchKey(filter.search);
  const matching = rows.filter((r) => (!filter.role || r.role === filter.role) && (!query || searchKey(r.name).includes(query)));
  const value = (r: ExploreRow): number | null => (filter.sort === "yours" ? (r.yours?.games ?? null) : r[filter.sort]);
  const sunk = (r: ExploreRow) => Number(filter.sort === "winRate" && r.games < minGames);
  return matching.sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    return sunk(a) - sunk(b) || Number(x === null) - Number(y === null) || (y ?? 0) - (x ?? 0) || b.games - a.games || a.name.localeCompare(b.name);
  });
}

/** One champion in one role, looked up: its numbers, your record, then its runes, build and matchups. */
export interface ExploreChampionView {
  champion: ChampView;
  role: string;
  /** The rank band in plain words; the loadout's `source` also covers the band above. */
  rank: string;
  games: number;
  winRate: number | null;
  pickRate: number | null;
  banRate: number | null;
  /** Your games on it in this role, or null. */
  yours: OwnRecord | null;
  /** The rune pages players take, most taken first (the first always; others from enough games). */
  pages: RunePageView[];
  /** Spells, skills and items. Items carry pick rate and win added only, never a raw win rate. Null without a build for the role. */
  loadout: LoadoutView | null;
  /** The most taken path of completed items: how many take it, never how it wins. */
  core: { items: IconView[]; share: number; games: number } | null;
  /** Lane opponents from enough games, by how far they beat what the two champions' usual win rates predict. */
  matchups: { best: MatchupRowView[]; worst: MatchupRowView[] };
}

/** The arguments of the champion lookup, or null when they aren't a champion id and a role. */
export function exploreArgs(championId: unknown, role: unknown): { championId: number; role: string } | null {
  if (typeof championId !== "number" || !Number.isSafeInteger(championId) || championId <= 0) return null;
  if (typeof role !== "string" || !role || role.length > 32) return null;
  return { championId, role };
}

/** One of your own games. */
export interface MyGameRow {
  matchId: string;
  championId: number;
  role: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSec: number;
  endedAt: number;
}

/** Your own games, newest first. Champions are listed once and rows refer to them. */
export interface MyGames {
  champions: ChampView[];
  /** The roles you've played, in the order the client lists them. */
  roles: string[];
  games: MyGameRow[];
}

export interface MyGamesFilter {
  /** 0: every champion. */
  championId: number;
  /** "": every role. */
  role: string;
}

export function filterMyGames(games: readonly MyGameRow[], filter: MyGamesFilter): MyGameRow[] {
  return games.filter((g) => (!filter.championId || g.championId === filter.championId) && (!filter.role || g.role === filter.role));
}

/** Your record on one champion, over the games given. */
export interface ChampionRecord extends OwnRecord {
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
}

/** Your record per champion, most played first. */
export function championRecords(games: readonly MyGameRow[]): ChampionRecord[] {
  const by = new Map<number, ChampionRecord>();
  for (const g of games) {
    const r = by.get(g.championId) ?? { championId: g.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    r.games += 1;
    r.wins += Number(g.win);
    r.kills += g.kills;
    r.deaths += g.deaths;
    r.assists += g.assists;
    by.set(g.championId, r);
  }
  return [...by.values()].sort((a, b) => b.games - a.games || b.wins - a.wins || a.championId - b.championId);
}

/** Kills and assists per death, counting a game without deaths as one death: the same number the client shows. */
export function kda(r: { kills: number; deaths: number; assists: number }): number {
  return (r.kills + r.assists) / Math.max(1, r.deaths);
}
