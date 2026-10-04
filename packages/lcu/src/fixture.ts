import { z } from "zod";

/**
 * A recorded client session: GET snapshots taken when recording started, plus every
 * WebSocket event in order with its offset. Always anonymised before it is written.
 */
export const FixtureSchema = z.object({
  format: z.literal(1),
  description: z.string().default(""),
  recordedAt: z.string(),
  /** GET endpoint → response body, captured at the start. */
  snapshots: z.record(z.string(), z.unknown()),
  frames: z.array(
    z.object({
      t: z.number().nonnegative(),
      uri: z.string(),
      eventType: z.string(),
      data: z.unknown(),
    }),
  ),
});
export type Fixture = z.infer<typeof FixtureSchema>;

/**
 * Keys that identify a player, account, game or chat room. Matched case-insensitively
 * against every key at any depth. Values under these keys are removed.
 */
const IDENTIFIER_KEY = /puuid|summoner(id|name)|accountid|gamename|tagline|displayname|internalname|alias|riotid|^name$|chat|password|token|jwt|obfuscated|^gameid$|profileicon|nameVisibility/i;

/** `id` alone is used for action ids, which are not identifiers; keep those. */
function isIdentifierKey(key: string, parentKey: string | null): boolean {
  if (key === "id") return parentKey === null; // a top-level `id` could be a game/lobby id
  return IDENTIFIER_KEY.test(key);
}

/** Deep-copies a value with every identifier key removed. */
export function anonymize<T>(value: T, parentKey: string | null = null): T {
  if (Array.isArray(value)) return value.map((v) => anonymize(v, parentKey)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isIdentifierKey(k, parentKey)) continue;
      out[k] = anonymize(v, k);
    }
    return out as T;
  }
  return value;
}

/** Lists the paths of any identifier keys left in a value (empty when clean). */
export function findIdentifiers(value: unknown, path = "$", parentKey: string | null = null): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findIdentifiers(v, `${path}[${i}]`, parentKey));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      isIdentifierKey(k, parentKey) ? [`${path}.${k}`] : findIdentifiers(v, `${path}.${k}`, k),
    );
  }
  return [];
}

export function anonymizeFixture(f: Fixture): Fixture {
  return {
    ...f,
    snapshots: Object.fromEntries(Object.entries(f.snapshots).map(([k, v]) => [k, anonymize(v)])),
    frames: f.frames.map((fr) => ({ ...fr, data: anonymize(fr.data) })),
  };
}
