import { z } from "zod";
import type { AdviceRecord, MatchSummary, MetaSnapshot, UserMatch } from "@ldc/shared";

/** Loose: checks the fields the app uses, tolerates new ones. */
const PublicUserSchema = z.looseObject({
  id: z.number(),
  riotId: z.string(),
  band: z.number().nullable(),
  lastSyncAt: z.number().nullable(),
  // Games of a long history still loading in the background (servers before 0.7.4 don't send it).
  historyBacklog: z.number().nullable().optional(),
});

const SyncStateSchema = z.union([
  z.looseObject({ state: z.literal("idle") }),
  z.looseObject({ state: z.literal("running"), done: z.number(), total: z.number() }),
  z.looseObject({ state: z.literal("done"), result: z.looseObject({ newMatches: z.number(), totalMatches: z.number() }) }),
  z.looseObject({ state: z.literal("error"), message: z.string() }),
]);
export type ServerSyncState = z.infer<typeof SyncStateSchema>;

const AdviceOptionSchema = z.looseObject({
  championId: z.number(),
  expectedWin: z.number().nullable(),
  terms: z.array(z.looseObject({ name: z.string(), rating: z.number(), deltaWin: z.number(), games: z.number() })),
});
/** What the coach showed when you locked in (the advice log), as the server stores it. */
export const AdviceRecordSchema = z.looseObject({
  gameId: z.number(),
  queueId: z.number().nullable(),
  role: z.string().nullable(),
  band: z.number(),
  lockedAt: z.number(),
  pick: AdviceOptionSchema,
  shown: z.array(AdviceOptionSchema),
});

const ProfileSchema = z.looseObject({
  user: PublicUserSchema,
  ranked: z.array(z.looseObject({ queueType: z.string(), tier: z.string() })),
  masteries: z.array(
    z.looseObject({
      championId: z.number(),
      level: z.number(),
      points: z.number(),
      lastPlayTime: z.number().optional(),
      grades: z.array(z.string()).optional(),
    }),
  ),
  // Match summaries are produced by our own server from validated Riot data; check the envelope only.
  matches: z.array(z.looseObject({ match: z.looseObject({ matchId: z.string(), endedAt: z.number() }), me: z.number().int() })),
  matchIds: z.array(z.string()),
  // The advice log (servers before 0.7 don't send it).
  advice: z.array(AdviceRecordSchema).default([]),
  // Your rank per day (servers before 0.7 don't send it).
  rankHistory: z.array(z.looseObject({ day: z.string(), queueType: z.string(), tier: z.string(), rank: z.string().nullable() })).default([]),
  sync: SyncStateSchema,
});
type Parsed = z.infer<typeof ProfileSchema>;
export interface ServerProfile {
  user: z.infer<typeof PublicUserSchema>;
  ranked: Parsed["ranked"];
  masteries: Parsed["masteries"];
  matches: UserMatch[];
  matchIds: string[];
  advice: AdviceRecord[];
  rankHistory: { day: string; queueType: string; tier: string; rank: string | null }[];
  sync: ServerSyncState;
}

/**
 * Meta snapshot (GET /meta/:band). Loose: checks the shape of what the engine reads and
 * tolerates new fields. Pairs are [championA, roleA, championB, roleB, games, winsOfA, n].
 */
const PairSchema = z.tuple([z.number(), z.string(), z.number(), z.string(), z.number(), z.number(), z.number()]);
export const MetaSnapshotSchema = z.looseObject({
  format: z.literal(1),
  band: z.number().int(),
  createdAt: z.number(),
  patch: z.string().nullable(),
  matches: z.number(),
  newestMatchAt: z.number().nullable(),
  halfLifeDays: z.number(),
  roleGames: z.record(z.string(), z.number()),
  champions: z.array(z.looseObject({ championId: z.number(), role: z.string(), games: z.number(), wins: z.number(), n: z.number() })),
  // Ban rates: absent in snapshots made before bans were collected.
  bans: z.array(z.looseObject({ championId: z.number(), bans: z.number(), n: z.number() })).optional(),
  banMatches: z.number().optional(),
  trending: z
    .array(
      z.looseObject({
        championId: z.number(),
        role: z.string(),
        rising: z.enum(["pick", "win", "both"]),
        pickRate: z.looseObject({ before: z.number(), recent: z.number() }),
        winRate: z.looseObject({ before: z.number(), recent: z.number() }),
        games: z.looseObject({ before: z.number(), recent: z.number() }),
      }),
    )
    .optional(),
  matchups: z.array(PairSchema),
  duos: z.array(PairSchema),
  attributes: z.array(
    z.looseObject({
      championId: z.number(),
      samples: z.number(),
      physicalShare: z.number(),
      magicShare: z.number(),
      trueShare: z.number(),
      frontline: z.number(),
      engage: z.number(),
      roleShares: z.record(z.string(), z.number()),
      roleSamples: z.number(),
    }),
  ),
  references: z.record(z.string(), z.record(z.string(), z.looseObject({ n: z.number(), quantiles: z.array(z.number()) }))),
  // How each champion wins (absent in snapshots made before it).
  championWins: z
    .array(z.looseObject({ championId: z.number(), role: z.string(), n: z.number(), metrics: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])) }))
    .optional(),
  // Builds (loadout): the fields every build carries; absent in snapshots made before builds.
  builds: z
    .array(
      z.looseObject({
        championId: z.number(),
        role: z.string(),
        n: z.number(),
        games: z.number(),
        wins: z.number(),
        pages: z.array(z.looseObject({ runes: z.array(z.number()), n: z.number() })),
        items: z.array(z.looseObject({ itemId: z.number(), slot: z.number(), n: z.number() })),
      }),
    )
    .optional(),
});

const ErrorBodySchema = z.looseObject({ error: z.string(), message: z.string().optional() });

export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Normalises what people type: trims, adds https:// when no scheme is given, drops a trailing slash. */
export function normalizeServerUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) throw new ServerError(0, "invalid_url", "Enter the server address you were given.");
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withScheme).toString().replace(/\/+$/, "");
  } catch {
    throw new ServerError(0, "invalid_url", `"${raw}" isn't a valid server address.`);
  }
}

/**
 * Talks to apps/server. The only network peer for player data in server mode:
 * the Riot API key never reaches this app.
 */
/**
 * Waits between retries while the server wakes up. The server sleeps when unused (to save
 * cost); the first request to a sleeping service can fail with 502/503/504 or a dropped
 * connection while it boots.
 */
export const WAKE_RETRY_DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000];
const WAKING_STATUSES = new Set([502, 503, 504]);

export class ServerClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    readonly baseUrl: string,
    private token: string | null,
    fetchFn?: typeof fetch,
    sleep?: (ms: number) => Promise<void>,
  ) {
    this.fetchFn = fetchFn ?? fetch;
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Sends a request, retrying while a sleeping server wakes up. */
  private async send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    let res: Response | null = null;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= WAKE_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await this.sleep(WAKE_RETRY_DELAYS_MS[attempt - 1]!);
      try {
        res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers: {
            accept: "application/json",
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
            ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
            ...headers,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        lastError = null;
        if (!WAKING_STATUSES.has(res.status)) break;
      } catch (err) {
        res = null;
        lastError = err as Error;
      }
    }
    if (!res) {
      throw new ServerError(0, "unreachable", `Can't reach the coach server at ${this.baseUrl} (${lastError?.message ?? "no response"}).`);
    }
    return res;
  }

  private async request<T extends z.ZodType>(method: string, path: string, schema: T, body?: unknown): Promise<z.infer<T>> {
    return this.parse(await this.send(method, path, body), schema);
  }

  private async parse<T extends z.ZodType>(res: Response, schema: T): Promise<z.infer<T>> {
    if (res.status === 204) return schema.parse(undefined);
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const e = ErrorBodySchema.safeParse(json);
      throw new ServerError(res.status, e.success ? e.data.error : "http_error", e.success && e.data.message ? e.data.message : `Server error (HTTP ${res.status}).`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ServerError(res.status, "bad_response", `The server sent an unexpected response:\n${z.prettifyError(parsed.error)}`);
    return parsed.data;
  }

  /** Registers with an invite; returns the new token (also used for later calls). */
  async register(inviteCode: string, riotId: string): Promise<{ token: string; riotId: string }> {
    const r = await this.request("POST", "/users", z.looseObject({ token: z.string(), user: PublicUserSchema }), { inviteCode, riotId });
    this.token = r.token;
    return { token: r.token, riotId: r.user.riotId };
  }

  async profile(since?: number): Promise<ServerProfile> {
    const r = await this.request("GET", `/me/profile${since !== undefined ? `?since=${since}` : ""}`, ProfileSchema);
    return r as unknown as ServerProfile;
  }

  async requestSync(): Promise<ServerSyncState> {
    return (await this.request("POST", "/me/sync", z.looseObject({ sync: SyncStateSchema }))).sync;
  }

  async syncState(): Promise<ServerSyncState> {
    return (await this.request("GET", "/me/sync", z.looseObject({ sync: SyncStateSchema }))).sync;
  }

  /**
   * The meta snapshot for a band. With the ETag of the copy we already have, the server
   * answers 304 and nothing is downloaded.
   */
  async meta(band: number, etag?: string | null): Promise<{ notModified: true } | { notModified: false; snapshot: MetaSnapshot; etag: string | null }> {
    const res = await this.send("GET", `/meta/${band}`, undefined, etag ? { "if-none-match": etag } : {});
    if (res.status === 304) return { notModified: true };
    const snapshot = (await this.parse(res, MetaSnapshotSchema)) as MetaSnapshot;
    return { notModified: false, snapshot, etag: res.headers.get("etag") };
  }

  /** The server's scoring config (raw JSON; the caller validates it). 304 when the ETag matches. */
  async config(etag?: string | null): Promise<{ notModified: true } | { notModified: false; config: unknown; etag: string | null }> {
    const res = await this.send("GET", "/config", undefined, etag ? { "if-none-match": etag } : {});
    if (res.status === 304) return { notModified: true };
    const config = await this.parse(res, z.unknown());
    return { notModified: false, config, etag: res.headers.get("etag") };
  }

  /** Sends what the coach showed for one game (after it ended). */
  async postAdvice(record: AdviceRecord): Promise<void> {
    await this.request("POST", "/advice", z.undefined(), record);
  }

  async deleteMe(): Promise<void> {
    await this.request("DELETE", "/me", z.undefined());
  }
}

export type { MatchSummary };
