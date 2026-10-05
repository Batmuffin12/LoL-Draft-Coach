import { z } from "zod";
import { RateLimiter, type Priority } from "./rate-limiter";
import {
  AccountSchema,
  LeagueEntriesSchema,
  LeaguePlayersSchema,
  MasteryListSchema,
  MatchIdsSchema,
  MatchSchema,
  type Account,
  type LeagueEntry,
  type LeaguePlayer,
  type Mastery,
  type Match,
} from "./schemas";

export type KeyType = "development" | "personal" | "production";

export interface RiotApiOptions {
  apiKey: string;
  keyType: KeyType;
  /** Platform routing value, e.g. "euw1" (League-V4, Champion-Mastery-V4). */
  platform: string;
  /** Regional routing value, e.g. "europe" (Account-V1, Match-V5). */
  region: string;
  limiter?: RateLimiter;
  fetch?: typeof fetch;
}

export class RiotApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    message?: string,
  ) {
    super(message ?? `Riot API ${endpoint} failed with HTTP ${status}`);
  }
}

/** The API key is missing, invalid or expired. */
export class RiotKeyError extends RiotApiError {}

export class RiotSchemaError extends Error {}

export function keyErrorMessage(keyType: KeyType, status: number): string {
  if (keyType === "development") {
    return (
      `Riot rejected the API key (HTTP ${status}). Development keys expire every 24 hours: ` +
      "get a new one at https://developer.riotgames.com, put it in RIOT_API_KEY in your .env, and restart the app."
    );
  }
  return `Riot rejected the ${keyType} API key (HTTP ${status}). Check RIOT_API_KEY in your .env (or the server variables) and the key's status at https://developer.riotgames.com.`;
}

/**
 * Riot Games API adapter. Every call goes through the shared RateLimiter.
 * Responses are validated with Zod so renamed fields fail with a clear error.
 */
export class RiotApi {
  readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch;
  private keyError: RiotKeyError | null = null;

  constructor(private readonly opts: RiotApiOptions) {
    this.limiter = opts.limiter ?? new RateLimiter();
    this.fetchFn = opts.fetch ?? fetch;
  }

  /** Set once Riot rejects the key; later calls fail fast instead of hammering the API. */
  get keyProblem(): RiotKeyError | null {
    return this.keyError;
  }

  private async request<T extends z.ZodType>(
    routing: string,
    methodId: string,
    path: string,
    schema: T,
    priority: Priority,
  ): Promise<z.infer<T> | null> {
    if (!this.opts.apiKey) {
      throw new RiotKeyError(0, methodId, "No Riot API key configured. Set RIOT_API_KEY in your .env.");
    }
    if (this.keyError) throw this.keyError;
    const host = `${routing}.api.riotgames.com`;
    const res = await this.limiter.schedule({ appScope: host, methodScope: `${host}|${methodId}`, priority }, () =>
      this.fetchFn(`https://${host}${path}`, { headers: { "X-Riot-Token": this.opts.apiKey } }),
    );
    if (res.status === 401 || res.status === 403) {
      this.keyError = new RiotKeyError(res.status, methodId, keyErrorMessage(this.opts.keyType, res.status));
      throw this.keyError;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new RiotApiError(res.status, methodId);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) {
      throw new RiotSchemaError(`Riot ${methodId} response changed shape:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  }

  accountByRiotId(gameName: string, tagLine: string, priority: Priority = "user"): Promise<Account | null> {
    return this.request(
      this.opts.region,
      "account-v1.by-riot-id",
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      AccountSchema,
      priority,
    );
  }

  async matchIdsByPuuid(
    puuid: string,
    query: { start?: number; count?: number; queue?: number; type?: string; startTime?: number } = {},
    priority: Priority = "user",
  ): Promise<string[]> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
    const qs = params.size ? `?${params}` : "";
    const ids = await this.request(
      this.opts.region,
      "match-v5.ids-by-puuid",
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids${qs}`,
      MatchIdsSchema,
      priority,
    );
    return ids ?? [];
  }

  match(matchId: string, priority: Priority = "user"): Promise<Match | null> {
    return this.request(this.opts.region, "match-v5.match", `/lol/match/v5/matches/${encodeURIComponent(matchId)}`, MatchSchema, priority);
  }

  async masteriesByPuuid(puuid: string, priority: Priority = "user"): Promise<Mastery[]> {
    const list = await this.request(
      this.opts.platform,
      "champion-mastery-v4.by-puuid",
      `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}`,
      MasteryListSchema,
      priority,
    );
    return list ?? [];
  }

  async leagueEntriesByPuuid(puuid: string, priority: Priority = "user"): Promise<LeagueEntry[]> {
    const list = await this.request(
      this.opts.platform,
      "league-v4.entries-by-puuid",
      `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
      LeagueEntriesSchema,
      priority,
    );
    return list ?? [];
  }

  /**
   * One page of ranked players in a tier and division (League-V4, below Master).
   * Pages start at 1; an empty page means the list has ended.
   */
  async leaguePlayers(
    query: { queue: string; tier: string; division: string; page: number },
    priority: Priority = "collector",
  ): Promise<LeaguePlayer[]> {
    const list = await this.request(
      this.opts.platform,
      "league-v4.entries-by-tier",
      `/lol/league/v4/entries/${encodeURIComponent(query.queue)}/${encodeURIComponent(query.tier)}/${encodeURIComponent(query.division)}?page=${query.page}`,
      LeaguePlayersSchema,
      priority,
    );
    return list ?? [];
  }
}
