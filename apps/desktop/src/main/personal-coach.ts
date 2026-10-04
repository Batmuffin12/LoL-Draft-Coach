import { unavailableChampions } from "@ldc/lcu";
import {
  bandFromRankedEntries,
  computeComfort,
  deriveChampionAttributes,
  draftRole,
  mainRole,
  recommendPicks,
  weightsForBand,
  type ChampionAttributes,
  type ComfortStats,
} from "@ldc/engine";
import { RiotKeyError, type RiotApi } from "@ldc/riot-api";
import type { ChampionId, RankBandId } from "@ldc/shared";
import type { PickView } from "../shared/view";
import { Coach, type CoachDeps } from "./coach";
import type { LoadedConfig } from "./config";
import { champView } from "./draft-view";
import type { MatchStore } from "./match-store";
import { loadProfile, type PersonalProfile } from "./profile";

export interface PersonalCoachDeps extends CoachDeps {
  config: LoadedConfig;
  /** Null when no Riot API key is configured. */
  riot: RiotApi | null;
  /** Riot ID from .env ("Name#TAG"), used when the League client isn't running. */
  riotId: string | null;
  storeFor: (puuid: string) => MatchStore;
}

/**
 * Milestone 2: adds the personal coach on top of the live draft — loads the player's
 * own history, works out their band, and ranks their pool for each draft update.
 * Only the local player's own identity is used, and only to load their own data.
 */
export class PersonalCoach extends Coach {
  private puuid: string | null = null;
  private loadingFor: string | null = null;
  private band: RankBandId;
  private profile: PersonalProfile | null = null;
  private comfort = new Map<ChampionId, ComfortStats>();
  private attributes = new Map<ChampionId, ChampionAttributes>();
  private pickable: ChampionId[] = [];
  private queueSupported = true;

  constructor(private readonly p: PersonalCoachDeps) {
    super(p);
    this.band = p.config.bands.defaultBand;
  }

  override async start(): Promise<void> {
    this.update({ status: { ...this.view.status, band: this.band } });
    if (!this.p.riot) {
      this.setProfileError("No Riot API key configured. Set RIOT_API_KEY in your .env to get personal picks.");
    }
    this.p.connector.on("status", (s) => {
      if (s === "connected") void this.onClientConnected();
    });
    await super.start();
    // Without the League client, fall back to the Riot ID from .env.
    if (this.p.connector.status !== "connected") void this.loadFromRiotId();
  }

  private setProfileError(message: string): void {
    this.update({ status: { ...this.view.status, profile: { state: "error", message } } });
  }

  private async onClientConnected(): Promise<void> {
    try {
      const me = await this.p.connector.getCurrentSummoner();
      const ranked = await this.p.connector.getRankedStats().catch(() => null);
      if (ranked) this.setBand(bandFromRankedEntries(ranked.queues, this.p.config.bands));
      if (me) await this.loadFor(me.puuid, false);
    } catch (err) {
      this.notice(`Could not read your account from the client: ${(err as Error).message}`);
    }
  }

  private async loadFromRiotId(): Promise<void> {
    const { riot, riotId } = this.p;
    if (!riot || !riotId || this.puuid) return;
    const [gameName, tagLine] = riotId.split("#");
    if (!gameName || !tagLine) return this.setProfileError(`RIOT_ID must look like Name#TAG (got "${riotId}")`);
    try {
      const account = await riot.accountByRiotId(gameName, tagLine);
      if (!account) return this.setProfileError(`Riot ID ${riotId} was not found.`);
      if (this.puuid) return; // the client connected meanwhile
      await this.loadFor(account.puuid, true);
    } catch (err) {
      this.onRiotError(err);
    }
  }

  private setBand(band: RankBandId): void {
    this.band = band;
    this.update({ status: { ...this.view.status, band } });
    this.onDraft();
  }

  private onRiotError(err: unknown): void {
    this.setProfileError(err instanceof RiotKeyError ? err.message : `Riot API error: ${(err as Error).message}`);
  }

  private async loadFor(puuid: string, bandFromApi: boolean): Promise<void> {
    const { riot } = this.p;
    if (!riot || this.puuid === puuid || this.loadingFor === puuid) return;
    this.loadingFor = puuid;
    try {
      if (bandFromApi) {
        const entries = await riot.leagueEntriesByPuuid(puuid);
        this.setBand(bandFromRankedEntries(entries, this.p.config.bands));
      }
      this.update({ status: { ...this.view.status, profile: { state: "loading", done: 0, total: this.p.config.app.history.matchCount } } });
      const profile = await loadProfile({
        riot,
        puuid,
        history: this.p.config.app.history,
        store: this.p.storeFor(puuid),
        onProgress: (done, total, partial) => {
          this.setProfile(partial);
          if (done < total) this.update({ status: { ...this.view.status, profile: { state: "loading", done, total } } });
        },
      });
      this.puuid = puuid;
      this.setProfile(profile);
      this.update({
        status: { ...this.view.status, profile: { state: "ready", games: profile.games.length, role: mainRole(profile.games) } },
      });
    } catch (err) {
      this.onRiotError(err);
    } finally {
      this.loadingFor = null;
    }
  }

  private setProfile(profile: PersonalProfile): void {
    const { engine } = this.p.config;
    this.profile = { games: [...profile.games], samples: [...profile.samples], masteries: profile.masteries };
    this.comfort = computeComfort(this.profile.games, this.profile.masteries, Date.now(), engine.comfort);
    this.attributes = deriveChampionAttributes(this.profile.samples, engine.teamNeeds.minAttributeSamples);
    this.onDraft();
  }

  /** On a new champ select: read which champions are pickable and whether the queue is supported. */
  private async onChampSelectStart(): Promise<void> {
    const { connector, config } = this.p;
    this.pickable = await connector.getPickableChampionIds().catch(() => []);
    const session = await connector.getGameflowSession().catch(() => null);
    const queueId = session?.gameData?.queue?.id;
    this.queueSupported = this.draft?.isCustomGame === true || queueId === undefined || config.app.supportedQueues.includes(queueId);
    if (!this.queueSupported) this.notice("This queue isn't supported yet — suggestions are for Ranked and Normal Draft.");
    this.onDraft();
  }

  private hadDraft = false;

  protected override onDraft(): void {
    super.onDraft();
    if (this.draft && !this.hadDraft) void this.onChampSelectStart();
    this.hadDraft = this.draft !== null;
    if (!this.draft || !this.profile || !this.queueSupported) {
      this.update({ picks: [], pickRole: this.profile ? mainRole(this.profile.games) : null });
      return;
    }
    const { engine } = this.p.config;
    const role = draftRole(this.draft, this.profile.games);
    const picks = recommendPicks({
      draft: this.draft,
      pickable: this.pickable,
      unavailable: unavailableChampions(this.draft),
      comfort: this.comfort,
      attributes: this.attributes,
      role,
      weights: weightsForBand(this.band, engine),
      config: engine,
    });
    const lookup = (id: number) => {
      try {
        return this.deps.ddragon.champion(id);
      } catch {
        return undefined;
      }
    };
    const views: PickView[] = picks.map((p) => ({
      champion: champView(p.championId, lookup)!,
      score: p.score,
      factors: p.factors,
      reasons: p.reasons,
    }));
    this.update({ picks: views, pickRole: role });
  }
}
