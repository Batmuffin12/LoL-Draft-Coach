import type { AttributeSample, MasteryEntry, PlayerGame } from "@ldc/engine";
import type { RiotApi } from "@ldc/riot-api";
import type { AppConfig } from "./config";
import { minimizeMatch, type MatchStore } from "./match-store";

/** Maximum page size of Match-V5 "ids by puuid" (documented API limit). */
export const MATCH_IDS_PAGE = 100;

export interface PersonalProfile {
  games: PlayerGame[];
  samples: AttributeSample[];
  masteries: MasteryEntry[];
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

  const profile: PersonalProfile = { games: [], samples: [], masteries };
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    let stored = await store.get(id);
    if (!stored) {
      const match = await riot.match(id);
      if (match) {
        stored = minimizeMatch(match, puuid);
        await store.put(stored);
      }
    }
    if (stored) {
      const me = stored.me;
      if (me) profile.games.push(me);
      // A champion appears once per match, so the player's own sample is the one on their champion.
      profile.samples.push(...stored.samples.map((s) => ({ ...s, self: me !== null && s.championId === me.championId })));
    }
    const done = i + 1;
    if (done % every === 0 || done === ids.length) opts.onProgress?.(done, ids.length, profile);
  }
  if (ids.length === 0) opts.onProgress?.(0, 0, profile);
  return profile;
}
