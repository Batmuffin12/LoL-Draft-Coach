import type { AttributeSample, MasteryEntry, PlayerGame } from "@ldc/engine";
import type { RiotApi } from "@ldc/riot-api";
import type { AppConfig } from "./config";
import { minimizeMatch, type MatchStore } from "./match-store";

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
  }));

  const idLists = [];
  for (const queue of history.queues) idLists.push(await riot.matchIdsByPuuid(puuid, { queue, count: Math.min(history.matchCount, 100) }));
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
      if (stored.me) profile.games.push(stored.me);
      profile.samples.push(...stored.samples);
    }
    const done = i + 1;
    if (done % every === 0 || done === ids.length) opts.onProgress?.(done, ids.length, profile);
  }
  if (ids.length === 0) opts.onProgress?.(0, 0, profile);
  return profile;
}
