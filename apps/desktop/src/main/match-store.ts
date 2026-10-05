import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UserMatch } from "@ldc/shared";
import { participantIndex, summarizeMatch, type Match } from "@ldc/riot-api";

/**
 * A match as the coach keeps it: the anonymised summary (no PUUIDs, names or other
 * identifiers) plus which participant the local player was. Same shape the server sends.
 */
export function toUserMatch(match: Match, puuid: string): UserMatch {
  return { match: summarizeMatch(match), me: participantIndex(match, puuid) };
}

/** Local cache of matches for dev-only direct mode (matches never change once played). One folder per account, named by a hash. */
export class MatchStore {
  private readonly dir: string;

  constructor(root: string, puuid: string) {
    this.dir = join(root, createHash("sha256").update(puuid).digest("hex").slice(0, 16));
  }

  async get(matchId: string): Promise<UserMatch | null> {
    try {
      const m = JSON.parse(await readFile(join(this.dir, `${matchId}.json`), "utf8")) as UserMatch;
      // Files from the pre-0.4 format (no participants) are refetched.
      return Array.isArray(m?.match?.participants) ? m : null;
    } catch {
      return null;
    }
  }

  async put(m: UserMatch): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${m.match.matchId}.json`), JSON.stringify(m), "utf8");
  }
}
