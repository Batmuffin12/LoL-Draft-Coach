import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { LiveGame } from "@ldc/shared";

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/**
 * A recorded live game: sanitized snapshots (no names, see sanitizeLiveGame) every few seconds.
 * Frames leave out events; `events` holds the full list from the last snapshot.
 */
export interface LiveFixture {
  format: 1;
  description: string;
  recordedAt: string;
  everySeconds: number;
  frames: { t: number; game: Omit<LiveGame, "events"> }[];
  events: LiveGame["events"];
}

const LiveFixtureSchema = z.object({
  format: z.literal(1),
  description: z.string(),
  recordedAt: z.string(),
  everySeconds: z.number().positive(),
  frames: z.array(z.object({ t: z.number().nonnegative(), game: z.record(z.string(), z.unknown()) })),
  events: z.array(z.record(z.string(), z.unknown())),
});

/** Keys that hold a player's identity in Riot's data (our own `assisters` are indexes): never in a fixture. */
export const IDENTITY_KEY = /summoner|[rR]iotId|[gG]ameName|[tT]agLine|puuid|^(KillerName|VictimName|Assisters|Acer|Recipient)$/;

/** Paths of identity keys in a value (empty when clean). */
export function identityKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => identityKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => (IDENTITY_KEY.test(k) ? [`${path}.${k}`] : identityKeys(v, `${path}.${k}`)));
  return [];
}

/** Loads a recorded live game from packages/live-client/fixtures (name without .json). */
export function loadLiveFixture(name: string): LiveFixture {
  return LiveFixtureSchema.parse(JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8"))) as unknown as LiveFixture;
}
