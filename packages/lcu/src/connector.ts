import { EventEmitter } from "node:events";
import { normalizePosition, type ChampionId, type ConnectionState, type Position } from "@ldc/shared";
import type { LcuCredentials } from "./credentials";
import { LcuHttp } from "./http";
import { LcuSocket, type LcuEvent } from "./socket";
import {
  ChampSelectSessionSchema,
  CurrentSummonerSchema,
  GameflowPhaseSchema,
  GameflowSessionSchema,
  PickableChampionIdsSchema,
  PerksSchema,
  PerkStylesSchema,
  type Perk,
  RankedStatsSchema,
  RecommendedPositionsSchema,
  parseLcu,
  type ChampSelectSession,
  type CurrentSummoner,
  type GameflowSession,
  type RankedStats,
} from "./schemas";

export const LCU_PATHS = {
  champSelectSession: "/lol-champ-select/v1/session",
  pickableChampionIds: "/lol-champ-select/v1/pickable-champion-ids",
  gameflowPhase: "/lol-gameflow/v1/gameflow-phase",
  gameflowSession: "/lol-gameflow/v1/session",
  rankedStats: "/lol-ranked/v1/current-ranked-stats",
  currentSummoner: "/lol-summoner/v1/current-summoner",
  recommendedPositions: "/lol-perks/v1/recommended-champion-positions",
  perks: "/lol-perks/v1/perks",
  perkStyles: "/lol-perks/v1/styles",
} as const;

export interface ConnectorEvents {
  status: [ConnectionState];
  gameflowPhase: [string];
  /** Raw (validated) session, or null when champ select ends. Sanitise before display. */
  champSelect: [ChampSelectSession | null];
  /** Every raw event, for the fixture recorder. */
  rawEvent: [LcuEvent];
  schemaError: [Error];
}

export interface ConnectorOptions {
  discover: () => Promise<LcuCredentials | null>;
  pollIntervalMs?: number;
  host?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keeps a connection to the League client: waits for it to start, subscribes to
 * champ select and gameflow events, and reconnects when the client restarts.
 */
export class LcuConnector extends EventEmitter<ConnectorEvents> {
  private http: LcuHttp | null = null;
  private socket: LcuSocket | null = null;
  private running = false;
  private state: ConnectionState = "disconnected";
  private creds: LcuCredentials | null = null;

  constructor(private readonly opts: ConnectorOptions) {
    super();
  }

  get status(): ConnectionState {
    return this.state;
  }

  /** The connected client's credentials, for the click-only importer (null when not connected). */
  get credentials(): LcuCredentials | null {
    return this.state === "connected" ? this.creds : null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.teardown();
    this.setState("disconnected");
  }

  private setState(s: ConnectionState): void {
    if (s === this.state) return;
    this.state = s;
    this.emit("status", s);
  }

  private teardown(): void {
    this.socket?.close();
    this.http?.close();
    this.socket = null;
    this.http = null;
  }

  private async loop(): Promise<void> {
    const poll = this.opts.pollIntervalMs ?? 2_000;
    while (this.running) {
      this.setState("searching");
      const creds = await this.opts.discover().catch(() => null);
      if (creds && this.running) {
        try {
          await this.connect(creds);
          await new Promise<void>((resolve) => this.socket?.once("close", resolve));
        } catch {
          // Client still booting or just closed; retry on the next poll.
        }
        this.teardown();
        if (!this.running) return;
        this.setState("disconnected");
      }
      await sleep(poll);
    }
  }

  private async connect(creds: LcuCredentials): Promise<void> {
    const http = new LcuHttp(creds, this.opts.host);
    // Fails until the client's API is ready, which sends us back to polling.
    const phase = parseLcu(GameflowPhaseSchema, LCU_PATHS.gameflowPhase, await http.get(LCU_PATHS.gameflowPhase));
    const socket = new LcuSocket(creds, this.opts.host);
    await socket.connect();
    this.http = http;
    this.socket = socket;
    this.creds = creds;

    socket.on("event", (e) => this.onEvent(e));
    socket.subscribe(LCU_PATHS.champSelectSession);
    socket.subscribe(LCU_PATHS.gameflowPhase);
    this.setState("connected");
    this.emit("gameflowPhase", phase);

    const session = await this.getChampSelect().catch(() => null);
    if (session) this.emit("champSelect", session);
  }

  private onEvent(e: LcuEvent): void {
    this.emit("rawEvent", e);
    try {
      if (e.uri === LCU_PATHS.gameflowPhase) {
        this.emit("gameflowPhase", parseLcu(GameflowPhaseSchema, e.uri, e.data));
      } else if (e.uri === LCU_PATHS.champSelectSession) {
        this.emit(
          "champSelect",
          e.eventType === "Delete" || e.data == null ? null : parseLcu(ChampSelectSessionSchema, e.uri, e.data),
        );
      }
    } catch (err) {
      this.emit("schemaError", err as Error);
    }
  }

  private requireHttp(): LcuHttp {
    if (!this.http) throw new Error("Not connected to the League client");
    return this.http;
  }

  /** GET + validate; for snapshot reads by the app and the recorder. */
  async getRaw(path: string): Promise<unknown | null> {
    return this.requireHttp().get(path);
  }

  async getChampSelect(): Promise<ChampSelectSession | null> {
    const data = await this.requireHttp().get(LCU_PATHS.champSelectSession);
    return data == null ? null : parseLcu(ChampSelectSessionSchema, LCU_PATHS.champSelectSession, data);
  }

  async getPickableChampionIds(): Promise<number[]> {
    const data = await this.requireHttp().get(LCU_PATHS.pickableChampionIds);
    return data == null ? [] : parseLcu(PickableChampionIdsSchema, LCU_PATHS.pickableChampionIds, data);
  }

  async getGameflowSession(): Promise<GameflowSession | null> {
    const data = await this.requireHttp().get(LCU_PATHS.gameflowSession);
    return data == null ? null : parseLcu(GameflowSessionSchema, LCU_PATHS.gameflowSession, data);
  }

  /** The local player's own ranked stats (used only to pick their rank band). */
  async getRankedStats(): Promise<RankedStats | null> {
    const data = await this.requireHttp().get(LCU_PATHS.rankedStats);
    return data == null ? null : parseLcu(RankedStatsSchema, LCU_PATHS.rankedStats, data);
  }

  /** Riot's recommended positions per champion (empty map when unavailable). */
  async getRecommendedPositions(): Promise<Map<ChampionId, Position[]>> {
    const data = await this.requireHttp().get(LCU_PATHS.recommendedPositions);
    if (data == null) return new Map();
    const parsed = parseLcu(RecommendedPositionsSchema, LCU_PATHS.recommendedPositions, data);
    return new Map(
      Object.entries(parsed).map(([id, v]) => [Number(id), v.recommendedPositions.map(normalizePosition).filter(Boolean)]),
    );
  }

  /** All runes and stat shards with names and icon paths (static game data; read only). */
  async getPerks(): Promise<Perk[]> {
    const data = await this.requireHttp().get(LCU_PATHS.perks);
    return data == null ? [] : parseLcu(PerksSchema, LCU_PATHS.perks, data);
  }

  /**
   * The stat shard rows as the client lists them (offense, flex, defense), each a row of
   * perk ids; empty when the client doesn't serve them (static game data; read only).
   */
  async getStatShardRows(): Promise<number[][]> {
    const data = await this.requireHttp().get(LCU_PATHS.perkStyles);
    if (data == null) return [];
    const styles = parseLcu(PerkStylesSchema, LCU_PATHS.perkStyles, data);
    const rows = (s: (typeof styles)[number]) => s.slots.filter((x) => x.type === "kStatMod").map((x) => x.perks);
    return styles.map(rows).find((r) => r.length > 0) ?? [];
  }

  /** The local player's own summoner (used only to load their own history). */
  async getCurrentSummoner(): Promise<CurrentSummoner | null> {
    const data = await this.requireHttp().get(LCU_PATHS.currentSummoner);
    return data == null ? null : parseLcu(CurrentSummonerSchema, LCU_PATHS.currentSummoner, data);
  }
}
