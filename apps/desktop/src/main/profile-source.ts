import { EventEmitter } from "node:events";
import { bandFromRankedEntries, mainRole, type AppConfig, type PlayerGame, type RankBandConfig } from "@ldc/engine";
import { RiotKeyError, type RiotApi } from "@ldc/riot-api";
import type { AdviceRecord, CoachStatus, RankBandId, UserMatch } from "@ldc/shared";
import { mergeAdvice, type AdviceStore } from "./advice-store";
import type { AccountView } from "../shared/view";
import type { AccountStore } from "./account-store";
import type { MatchStore } from "./match-store";
import { loadProfile, profileFromMatches, type PersonalProfile } from "./profile";
import { normalizeServerUrl, ServerClient, ServerError, type ServerProfile } from "./server-client";

/** The local player's Riot ID, read from the League client (or RIOT_ID in .env for the mock client). */
export interface Identity {
  gameName: string;
  tagLine: string;
}

export type ProfileStatus = CoachStatus["profile"];

export interface ProfileSourceEvents {
  /** A (possibly partial) profile; replaces the previous one. */
  profile: [PersonalProfile];
  status: [ProfileStatus];
  /** Rank band from League-V4, when the client couldn't provide one. */
  band: [RankBandId];
  /** Server mode only: registration state for the panel. */
  account: [AccountView];
  /** The advice log: what the coach showed in your recent games, newest first. */
  advice: [AdviceRecord[]];
}

/** Where the player's own history comes from: our server (default) or the Riot API directly (dev only). */
export interface ProfileSource extends EventEmitter<ProfileSourceEvents> {
  /** Loads the profile of this player. `bandFromApi`: emit the band (the client had no ranked data). */
  load(identity: Identity, opts: { bandFromApi: boolean }): Promise<void>;
  /** A game just ended: fetch the new games. */
  refresh(): Promise<void>;
  /** Keeps what the coach showed for a game that has ended (the advice log). */
  recordAdvice(record: AdviceRecord): Promise<void>;
  /** Server mode: the current registration state. */
  readonly account?: AccountView;
}

const riotIdOf = (i: Identity) => `${i.gameName}#${i.tagLine}`;
const sameRiotId = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const readyStatus = (games: PlayerGame[]): ProfileStatus => ({ state: "ready", games: games.length, role: mainRole(games) });

/**
 * Dev-only: calls the Riot API from this process with the key in the local .env
 * (the pre-server behaviour). Never used in packaged builds.
 */
export class DirectProfileSource extends EventEmitter<ProfileSourceEvents> implements ProfileSource {
  private puuid: string | null = null;
  private loadingFor: string | null = null;
  private last: { identity: Identity; bandFromApi: boolean } | null = null;

  constructor(
    private readonly deps: {
      riot: RiotApi;
      history: AppConfig["history"];
      bands: RankBandConfig;
      storeFor: (puuid: string) => MatchStore;
      /** The local advice log (none: advice isn't kept). */
      advice?: AdviceStore;
    },
  ) {
    super();
  }

  async recordAdvice(record: AdviceRecord): Promise<void> {
    if (this.deps.advice) this.emit("advice", await this.deps.advice.add(record));
  }

  async load(identity: Identity, opts: { bandFromApi: boolean }): Promise<void> {
    this.last = { identity, bandFromApi: opts.bandFromApi };
    try {
      const account = await this.deps.riot.accountByRiotId(identity.gameName, identity.tagLine);
      if (!account) return this.error(`Riot ID ${riotIdOf(identity)} was not found.`);
      await this.loadFor(account.puuid, opts.bandFromApi);
    } catch (err) {
      this.onRiotError(err);
    }
  }

  async refresh(): Promise<void> {
    if (!this.last) return;
    this.puuid = null; // re-read the match list; cached matches aren't fetched again
    await this.load(this.last.identity, { bandFromApi: this.last.bandFromApi });
  }

  private error(message: string): void {
    this.emit("status", { state: "error", message });
  }

  private onRiotError(err: unknown): void {
    this.error(err instanceof RiotKeyError ? err.message : `Riot API error: ${(err as Error).message}`);
  }

  private async loadFor(puuid: string, bandFromApi: boolean): Promise<void> {
    const { riot } = this.deps;
    if (this.puuid === puuid || this.loadingFor === puuid) return;
    this.loadingFor = puuid;
    try {
      if (bandFromApi) this.emit("band", bandFromRankedEntries(await riot.leagueEntriesByPuuid(puuid), this.deps.bands));
      this.emit("status", { state: "loading", done: 0, total: this.deps.history.matchCount });
      if (this.deps.advice) this.emit("advice", await this.deps.advice.list());
      const profile = await loadProfile({
        riot,
        puuid,
        history: this.deps.history,
        store: this.deps.storeFor(puuid),
        onProgress: (done, total, partial) => {
          this.emit("profile", partial);
          if (done < total) this.emit("status", { state: "loading", done, total });
        },
      });
      this.puuid = puuid;
      this.emit("profile", profile);
      this.emit("status", readyStatus(profile.games));
    } catch (err) {
      this.onRiotError(err);
    } finally {
      this.loadingFor = null;
    }
  }
}

/**
 * Dev aid (LDC_PROFILE_FILE, development builds only): your history from a saved file
 * ({ matches, masteries }), so the panel and screenshots work without a Riot key.
 */
export class FileProfileSource extends EventEmitter<ProfileSourceEvents> implements ProfileSource {
  constructor(
    private readonly deps: {
      read: () => Promise<{ matches: UserMatch[]; masteries: PersonalProfile["masteries"] }>;
      advice?: AdviceStore;
    },
  ) {
    super();
  }

  async load(): Promise<void> {
    if (this.deps.advice) this.emit("advice", await this.deps.advice.list());
    const { matches, masteries } = await this.deps.read();
    const profile = profileFromMatches(matches, masteries);
    this.emit("profile", profile);
    this.emit("status", readyStatus(profile.games));
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  async recordAdvice(record: AdviceRecord): Promise<void> {
    if (this.deps.advice) this.emit("advice", await this.deps.advice.add(record));
  }
}

export interface ServerProfileSourceDeps {
  accounts: AccountStore;
  /** Prefilled in the registration form (from SERVER_URL or the app config). */
  defaultServerUrl: string | null;
  fetch?: typeof fetch;
  /** How often to poll while the server is syncing. */
  pollMs?: number;
  /** Wait function for wake-up retries (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Default mode: the player's history comes from our server, which holds the only Riot
 * API key. Handles registration with an invite code, incremental profile updates and
 * waiting for the server's sync.
 */
export class ServerProfileSource extends EventEmitter<ProfileSourceEvents> implements ProfileSource {
  private identity: Identity | null = null;
  private bandFromApi = false;
  private client: ServerClient | null = null;
  private registeredAs: string | null = null;
  private matches = new Map<string, UserMatch>();
  private advice: AdviceRecord[] = [];
  private polling = false;
  private stopped = false;
  private view: AccountView;

  constructor(private readonly deps: ServerProfileSourceDeps) {
    super();
    this.view = { state: "unregistered", riotId: null, serverUrl: null, defaultServerUrl: deps.defaultServerUrl, message: null };
  }

  get account(): AccountView {
    return this.view;
  }

  /** The client for the registered server (null until registered). Used for meta snapshots too. */
  get serverClient(): ServerClient | null {
    return this.view.state === "registered" ? this.client : null;
  }

  stop(): void {
    this.stopped = true;
  }

  private setAccount(patch: Partial<AccountView>): void {
    this.view = { ...this.view, ...patch };
    this.emit("account", this.view);
  }

  /** Reads the stored registration (if any). Call once at startup. */
  async init(): Promise<void> {
    const a = await this.deps.accounts.load();
    if (!a) return this.setAccount({ state: "unregistered" });
    this.client = new ServerClient(a.serverUrl, a.token, this.deps.fetch, this.deps.sleep);
    this.registeredAs = a.riotId;
    this.setAccount({ state: "registered", riotId: a.riotId, serverUrl: a.serverUrl, message: null });
  }

  async load(identity: Identity, opts: { bandFromApi: boolean }): Promise<void> {
    this.identity = identity;
    this.bandFromApi = opts.bandFromApi;
    if (!this.client || !this.registeredAs) {
      this.emit("status", { state: "idle" });
      return;
    }
    if (!sameRiotId(this.registeredAs, riotIdOf(identity))) {
      this.setAccount({
        state: "mismatch",
        message: `This app is set up for ${this.registeredAs}, but the League client is logged in as ${riotIdOf(identity)}. Register again to switch.`,
      });
      this.emit("status", { state: "error", message: `Registered as ${this.registeredAs}, not ${riotIdOf(identity)}.` });
      return;
    }
    await this.fetchProfile();
  }

  async refresh(): Promise<void> {
    if (!this.client || this.view.state !== "registered") return;
    try {
      await this.client.requestSync();
      await this.waitForSync();
    } catch (err) {
      this.onServerError(err);
    }
  }

  async recordAdvice(record: AdviceRecord): Promise<void> {
    if (!this.client || this.view.state !== "registered") return;
    // Shown at once; the server's copy comes back with the next profile.
    this.advice = mergeAdvice(this.advice, record);
    this.emit("advice", this.advice);
    try {
      await this.client.postAdvice(record);
    } catch (err) {
      this.onServerError(err);
    }
  }

  /** Registers the player logged into the client, using an invite code. */
  async register(serverUrlInput: string, inviteCode: string): Promise<void> {
    if (!this.identity) {
      this.setAccount({ state: "error", message: "Open the League client and log in first, so the app can read your Riot ID." });
      return;
    }
    const riotId = riotIdOf(this.identity);
    this.setAccount({ state: "registering", message: null });
    try {
      const serverUrl = normalizeServerUrl(serverUrlInput);
      const client = new ServerClient(serverUrl, null, this.deps.fetch, this.deps.sleep);
      const r = await client.register(inviteCode, riotId);
      await this.deps.accounts.save({ serverUrl, token: r.token, riotId: r.riotId });
      this.client = client;
      this.registeredAs = r.riotId;
      this.matches.clear();
      this.setAccount({ state: "registered", riotId: r.riotId, serverUrl, message: null });
      this.emit("status", { state: "loading", done: 0, total: 0 });
      await this.waitForSync();
    } catch (err) {
      this.setAccount({ state: "error", message: (err as Error).message });
    }
  }

  /** Forgets the registration on this PC (the server keeps the data). */
  async signOut(): Promise<void> {
    await this.deps.accounts.clear();
    this.client = null;
    this.registeredAs = null;
    this.matches.clear();
    this.advice = [];
    this.setAccount({ state: "unregistered", riotId: null, serverUrl: null, message: null });
    this.emit("profile", profileFromMatches([], []));
    this.emit("advice", []);
    this.emit("status", { state: "idle" });
  }

  /** Deletes everything the server stores about this player, then signs out. */
  async deleteData(): Promise<void> {
    try {
      await this.client?.deleteMe();
      await this.signOut();
    } catch (err) {
      this.setAccount({ message: (err as Error).message });
    }
  }

  private async fetchProfile(): Promise<void> {
    if (!this.client) return;
    try {
      const newest = Math.max(0, ...[...this.matches.values()].map((m) => m.match.endedAt));
      const p = await this.client.profile(this.matches.size ? newest : undefined);
      this.apply(p);
      if (p.sync.state === "running") await this.waitForSync();
    } catch (err) {
      this.onServerError(err);
    }
  }

  private apply(p: ServerProfile): void {
    for (const m of p.matches) this.matches.set(m.match.matchId, m);
    const keep = new Set(p.matchIds);
    for (const id of this.matches.keys()) if (!keep.has(id)) this.matches.delete(id);

    const profile = profileFromMatches(
      [...this.matches.values()],
      p.masteries.map((m) => ({
        championId: m.championId,
        level: m.level,
        points: m.points,
        ...(m.lastPlayTime !== undefined ? { lastPlayTime: m.lastPlayTime } : {}),
        ...(m.grades ? { grades: m.grades } : {}),
      })),
    );
    if (this.bandFromApi && p.user.band !== null) this.emit("band", p.user.band);
    this.emit("profile", { ...profile, rankHistory: p.rankHistory });
    this.advice = p.advice;
    this.emit("advice", this.advice);
    if (p.sync.state === "running") this.emit("status", { state: "loading", done: p.sync.done, total: p.sync.total });
    else if (p.sync.state === "error" && !profile.games.length) this.emit("status", { state: "error", message: `The server couldn't load your games: ${p.sync.message}` });
    else this.emit("status", readyStatus(profile.games));
  }

  /** Polls the server's sync for this player until it finishes, then fetches the new games. */
  private async waitForSync(): Promise<void> {
    if (!this.client || this.polling) return;
    this.polling = true;
    try {
      for (;;) {
        if (this.stopped) return;
        const s = await this.client.syncState();
        if (s.state === "running") {
          this.emit("status", { state: "loading", done: s.done, total: s.total });
          await new Promise((r) => setTimeout(r, this.deps.pollMs ?? 2_000));
          continue;
        }
        break;
      }
    } finally {
      this.polling = false;
    }
    await this.fetchProfile();
  }

  private onServerError(err: unknown): void {
    if (err instanceof ServerError && err.status === 401) {
      void this.deps.accounts.clear();
      this.client = null;
      this.registeredAs = null;
      this.setAccount({
        state: "unregistered",
        riotId: null,
        message: "The server doesn't know this app any more (registration removed or replaced). Register again with a new invite code.",
      });
      this.emit("status", { state: "idle" });
      return;
    }
    this.emit("status", { state: "error", message: (err as Error).message });
  }
}

/**
 * Which profile source to use. Direct Riot API access is a development aid only:
 * never in a packaged build, and not when a coach server address is configured.
 */
export function profileMode(o: { packaged: boolean; riotApiKey: string | null; serverUrl: string | null }): "server" | "direct" {
  return !o.packaged && o.riotApiKey && !o.serverUrl ? "direct" : "server";
}
