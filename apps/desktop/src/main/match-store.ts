import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePosition } from "@ldc/shared";
import type { AttributeSample, PlayerGame } from "@ldc/engine";
import type { Match } from "@ldc/riot-api";

/**
 * A match reduced to what the engine needs. No PUUIDs, names or other identifiers
 * are kept: only the local player's own result and per-champion stats.
 */
export interface StoredMatch {
  matchId: string;
  queueId: number;
  endedAt: number;
  durationSec: number;
  gameVersion: string;
  me: PlayerGame | null;
  samples: AttributeSample[];
}

export function minimizeMatch(match: Match, puuid: string): StoredMatch {
  const info = match.info;
  // Match-V5 gameDuration is in seconds for current matches.
  const durationSec = info.gameDuration;
  const endedAt = info.gameEndTimestamp ?? info.gameCreation + durationSec * 1000;
  const mine = info.participants.find((p) => p.puuid === puuid);
  return {
    matchId: match.metadata.matchId,
    queueId: info.queueId,
    endedAt,
    durationSec,
    gameVersion: info.gameVersion,
    me: mine ? { championId: mine.championId, position: normalizePosition(mine.teamPosition), win: mine.win, endedAt } : null,
    samples: info.participants.map((p) => ({
      championId: p.championId,
      position: normalizePosition(p.teamPosition),
      physicalDamage: p.physicalDamageDealtToChampions,
      magicDamage: p.magicDamageDealtToChampions,
      trueDamage: p.trueDamageDealtToChampions,
      damageTaken: p.totalDamageTaken,
      selfMitigated: p.damageSelfMitigated,
      ccSeconds: p.timeCCingOthers,
      durationSec,
    })),
  };
}

/** Local cache of minimised matches (matches never change once played). One folder per account, named by a hash. */
export class MatchStore {
  private readonly dir: string;

  constructor(root: string, puuid: string) {
    this.dir = join(root, createHash("sha256").update(puuid).digest("hex").slice(0, 16));
  }

  async get(matchId: string): Promise<StoredMatch | null> {
    try {
      return JSON.parse(await readFile(join(this.dir, `${matchId}.json`), "utf8")) as StoredMatch;
    } catch {
      return null;
    }
  }

  async put(m: StoredMatch): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${m.matchId}.json`), JSON.stringify(m), "utf8");
  }
}
