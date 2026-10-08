import { attributeSamples, playerGame, type AttributeSample, type MasteryEntry, type PlayerGame, type RankPoint } from "@ldc/engine";
import type { UserMatch } from "@ldc/shared";
import type { RiotApi } from "@ldc/riot-api";
import type { AppConfig } from "./config";
import { toUserMatch, type MatchStore } from "./match-store";

/** Maximum page size of Match-V5 "ids by puuid" (documented API limit). */
export const MATCH_IDS_PAGE = 100;

export interface PersonalProfile {
  /** The player's own matches, newest first, with every (anonymised) participant. */
  matches: UserMatch[];
  /** Derived from `matches`: the player's own games. */
  games: PlayerGame[];
  /** Derived from `matches`: every participant as an attribute sample. */
  samples: AttributeSample[];
  masteries: MasteryEntry[];
  /** Your rank per day (server mode; the monthly report's rank trend). */
  rankHistory?: RankPoint[];
}

/** Sorts Match-V5 ids newest first by their numeric part (e.g. EUW1_7123456789). */
export function sortMatchIdsNewestFirst(ids: string[]): string[] {
  const num = (id: string) => Number(/_(\d+)$/.exec(id)?.[1] ?? 0);
  return [...new Set(ids)].sort((a, b) => num(b) - num(a));
}

export interface LoadProfileOptions {
  riot: RiotApi;
  puuid: string;
  history: AppConfig["history"];
  store: MatchStore;
  /** Called as matches load; `partial` lets the panel show picks before everything is in. */
  onProgress?: (done: number, total: number, partial: PersonalProfile) => void;
  progressEvery?: number;
}

/**
 * Loads the player's own recent games and mastery through the Riot API adapter,
 * using the local match cache so only new matches are fetched.
 */
export async function loadProfile(opts: LoadProfileOptions): Promise<PersonalProfile> {
  const { riot, puuid, history, store } = opts;
  const every = opts.progressEvery ?? 10;

  const masteries: MasteryEntry[] = (await riot.masteriesByPuuid(puuid)).map((m) => ({
    championId: m.championId,
    level: m.championLevel,
    points: m.championPoints,
    ...(m.lastPlayTime !== undefined ? { lastPlayTime: m.lastPlayTime } : {}),
    ...(m.milestoneGrades ? { grades: m.milestoneGrades } : {}),
  }));

  const idLists: string[][] = [];
  for (const queue of history.queues) {
    // Match-V5 returns at most MATCH_IDS_PAGE ids per call; page with `start`.
    for (let start = 0; start < history.matchCount; start += MATCH_IDS_PAGE) {
      const page = await riot.matchIdsByPuuid(puuid, { queue, start, count: Math.min(MATCH_IDS_PAGE, history.matchCount - start) });
      idLists.push(page);
      if (page.length < MATCH_IDS_PAGE) break;
    }
  }
  const ids = sortMatchIdsNewestFirst(idLists.flat()).slice(0, history.matchCount);

  const matches: UserMatch[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    let stored = await store.get(id);
    if (!stored) {
      const match = await riot.match(id);
      if (match) {
        stored = toUserMatch(match, puuid);
        await store.put(stored);
      }
    }
    if (stored && stored.me >= 0) matches.push(stored);
    const done = i + 1;
    if (done % every === 0 || done === ids.length) opts.onProgress?.(done, ids.length, profileFromMatches(matches, masteries));
  }
  const profile = profileFromMatches(matches, masteries);
  if (ids.length === 0) opts.onProgress?.(0, 0, profile);
  return profile;
}

/** Builds a profile from the player's own matches (any order) and mastery. */
export function profileFromMatches(matches: UserMatch[], masteries: MasteryEntry[]): PersonalProfile {
  const sorted = [...matches].sort((a, b) => b.match.endedAt - a.match.endedAt);
  return {
    matches: sorted,
    games: sorted.map(playerGame).filter((g): g is PlayerGame => g !== null),
    samples: sorted.flatMap(attributeSamples),
    masteries,
  };
}
