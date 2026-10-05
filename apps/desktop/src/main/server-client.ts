import { z } from "zod";
import type { MatchSummary, UserMatch } from "@ldc/shared";

/** Loose: checks the fields the app uses, tolerates new ones. */
const PublicUserSchema = z.looseObject({
  id: z.number(),
  riotId: z.string(),
  band: z.number().nullable(),
  lastSyncAt: z.number().nullable(),
});

const SyncStateSchema = z.union([
  z.looseObject({ state: z.literal("idle") }),
  z.looseObject({ state: z.literal("running"), done: z.number(), total: z.number() }),
  z.looseObject({ state: z.literal("done"), result: z.looseObject({ newMatches: z.number(), totalMatches: z.number() }) }),
  z.looseObject({ state: z.literal("error"), message: z.string() }),
]);
export type ServerSyncState = z.infer<typeof SyncStateSchema>;

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
  sync: SyncStateSchema,
});
type Parsed = z.infer<typeof ProfileSchema>;
export interface ServerProfile {
  user: z.infer<typeof PublicUserSchema>;
  ranked: Parsed["ranked"];
  masteries: Parsed["masteries"];
  matches: UserMatch[];
  matchIds: string[];
  sync: ServerSyncState;
}

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
export class ServerClient {
  private readonly fetchFn: typeof fetch;

  constructor(
    readonly baseUrl: string,
    private token: string | null,
    fetchFn?: typeof fetch,
  ) {
    this.fetchFn = fetchFn ?? fetch;
  }

  private async request<T extends z.ZodType>(method: string, path: string, schema: T, body?: unknown): Promise<z.infer<T>> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new ServerError(0, "unreachable", `Can't reach the coach server at ${this.baseUrl} (${(err as Error).message}).`);
    }
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

  async deleteMe(): Promise<void> {
    await this.request("DELETE", "/me", z.undefined());
  }
}

export type { MatchSummary };
