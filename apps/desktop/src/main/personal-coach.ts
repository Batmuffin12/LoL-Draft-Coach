import { unavailableChampions } from "@ldc/lcu";
import {
  adviseRoles,
  bandFromRankedEntries,
  computeComfort,
  deriveChampionAttributes,
  draftRole,
  advisePicks,
  mainRole,
  renderReason,
  weightsForBand,
  type ChampionAttributes,
  type ComfortStats,
} from "@ldc/engine";
import type { ChampionId, Position, RankBandId } from "@ldc/shared";
import type { PickView } from "../shared/view";
import { Coach, type CoachDeps } from "./coach";
import type { LoadedConfig } from "./config";
import { champView } from "./draft-view";
import type { PersonalProfile } from "./profile";
import type { Identity, ProfileSource } from "./profile-source";

export interface PersonalCoachDeps extends CoachDeps {
  config: LoadedConfig;
  /** Where the player's history comes from; null when neither a server nor a dev key is set up. */
  profiles: ProfileSource | null;
  /** Shown when `profiles` is null. */
  noProfileMessage?: string;
  /** Riot ID from .env ("Name#TAG"), used when the client reports no account (mock client / demo). */
  riotId: string | null;
}

/**
 * Adds the personal coach on top of the live draft: gets the player's own history from
 * a ProfileSource, works out their band, and ranks their pool for each draft update.
 * Only the local player's own identity is used, and only to load their own data.
 */
export class PersonalCoach extends Coach {
  private band: RankBandId;
  private profile: PersonalProfile | null = null;
  private identity: Identity | null = null;
  /** Comfort per role ("" = no role), computed lazily and reset when the profile changes. */
  private comfortByRole = new Map<string, Map<ChampionId, ComfortStats>>();
  /** Riot's recommended positions per champion, read from the client. */
  private intendedPositions = new Map<ChampionId, Position[]>();
  private attributes = new Map<ChampionId, ChampionAttributes>();
  private pickable: ChampionId[] = [];
  private queueSupported = true;

  constructor(private readonly p: PersonalCoachDeps) {
    super(p);
    this.band = p.config.bands.defaultBand;
  }

  /** The Riot ID of the player logged into the client, once known. */
  get currentIdentity(): Identity | null {
    return this.identity;
  }

  override async start(): Promise<void> {
    this.update({ status: { ...this.view.status, band: this.band } });
    const { profiles } = this.p;
    if (!profiles) {
      this.setProfileError(this.p.noProfileMessage ?? "No coach server or Riot API key configured.");
    } else {
      profiles.on("profile", (profile) => this.setProfile(profile));
      profiles.on("status", (profile) => this.update({ status: { ...this.view.status, profile } }));
      profiles.on("band", (band) => this.setBand(band));
      profiles.on("account", (account) => this.update({ account }));
      if (profiles.account) this.update({ account: profiles.account });
    }
    this.p.ddragon.on("patch", () => this.updateRoleAdvice()); // champion names/icons for the lobby
    this.p.connector.on("status", (s) => {
      if (s === "connected") void this.onClientConnected();
    });
    this.p.connector.on("gameflowPhase", (phase) => {
      // New games are in the player's history once a game has ended.
      if (phase === "EndOfGame") void this.p.profiles?.refresh();
    });
    await super.start();
    // Without the League client, fall back to the Riot ID from .env.
    if (this.p.connector.status !== "connected") void this.loadFromRiotId();
  }

  private setProfileError(message: string): void {
    this.update({ status: { ...this.view.status, profile: { state: "error", message } } });
  }

  /**
   * The client's PUUID cannot be used with the Riot API (Riot encrypts PUUIDs per API key),
   * so we take the Riot ID from the client and let the profile source resolve it.
   */
  private async onClientConnected(): Promise<void> {
    try {
      const me = await this.p.connector.getCurrentSummoner();
      const ranked = await this.p.connector.getRankedStats().catch(() => null);
      this.intendedPositions = await this.p.connector.getRecommendedPositions().catch(() => new Map());
      this.updateRoleAdvice();
      this.onDraft();
      if (ranked) this.setBand(bandFromRankedEntries(ranked.queues, this.p.config.bands));
      if (me?.gameName && me.tagLine) {
        this.identity = { gameName: me.gameName, tagLine: me.tagLine };
        await this.p.profiles?.load(this.identity, { bandFromApi: !ranked });
      } else await this.loadFromRiotId(); // e.g. the mock client, which has no account
    } catch (err) {
      this.notice(`Could not read your account from the client: ${(err as Error).message}`);
    }
  }

  /** Fallback when the client isn't running or has no account: RIOT_ID from .env. */
  private async loadFromRiotId(): Promise<void> {
    const { riotId, profiles } = this.p;
    if (!profiles || !riotId || this.identity) return;
    const i = riotId.lastIndexOf("#");
    const gameName = riotId.slice(0, i).trim();
    const tagLine = riotId.slice(i + 1).trim();
    if (i < 0 || !gameName || !tagLine) {
      return this.setProfileError(`RIOT_ID must look like "Name#TAG", in quotes (got "${riotId}")`);
    }
    this.identity = { gameName, tagLine };
    await profiles.load(this.identity, { bandFromApi: true });
  }

  private setBand(band: RankBandId): void {
    this.band = band;
    this.update({ status: { ...this.view.status, band } });
    this.onDraft();
  }

  private setProfile(profile: PersonalProfile): void {
    const { engine } = this.p.config;
    this.profile = profile;
    this.comfortByRole.clear();
    this.attributes = deriveChampionAttributes(this.profile.samples, engine.teamNeeds.minAttributeSamples);
    this.updateRoleAdvice();
    this.onDraft();
  }

  private updateRoleAdvice(): void {
    if (!this.profile) return;
    const lookup = (id: number) => {
      try {
        return this.deps.ddragon.champion(id);
      } catch {
        return undefined;
      }
    };
    const roles = adviseRoles(
      this.profile.games,
      this.profile.masteries,
      Date.now(),
      this.p.config.engine,
      this.intendedPositions,
      this.attributes,
    ).map((r) => ({
      role: r.role,
      games: r.games,
      winRate: r.winRate,
      score: r.score,
      enoughData: r.enoughData,
      champions: r.topChampions.map((id) => champView(id, lookup)!),
    }));
    this.update({ roles });
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
      this.update({ picks: [], pickAdvice: { whyNot: null, confidence: null }, pickRole: this.profile ? mainRole(this.profile.games) : null });
      return;
    }
    const { engine } = this.p.config;
    const role = draftRole(this.draft, this.profile.games);
    const key = role ?? "";
    let comfort = this.comfortByRole.get(key);
    if (!comfort) {
      comfort = computeComfort(this.profile.games, this.profile.masteries, Date.now(), engine.comfort, role);
      this.comfortByRole.set(key, comfort);
    }
    const advice = advisePicks({
      draft: this.draft,
      pickable: this.pickable,
      unavailable: unavailableChampions(this.draft),
      comfort,
      attributes: this.attributes,
      intendedPositions: this.intendedPositions,
      role,
      weights: weightsForBand(this.band, engine),
      config: engine,
    }, this.p.config.explain.settings);
    const lookup = (id: number) => {
      try {
        return this.deps.ddragon.champion(id);
      } catch {
        return undefined;
      }
    };
    const { templates } = this.p.config.explain;
    const nameOf = (id: number) => lookup(id)?.name ?? `#${id}`;
    const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, templates, nameOf);
    const views: PickView[] = advice.picks.map((p) => ({
      champion: champView(p.championId, lookup)!,
      score: p.score,
      factors: p.factors,
      reasons: p.reasons.map(say),
      offMeta: p.offMeta,
    }));
    const pickAdvice = {
      whyNot: advice.whyNot ? say(advice.whyNot) : null,
      confidence: advice.confidence ? { level: advice.confidence, label: say({ id: `confidence.${advice.confidence}`, slots: {} }) } : null,
    };
    this.update({ picks: views, pickAdvice, pickRole: role });
  }
}
