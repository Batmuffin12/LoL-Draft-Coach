import type { LobbyRoles } from "@ldc/lcu";
import {
  completedItems,
  bandFromRankedEntries,
  deriveChampionAttributes,
  renderReason,
  type GrowthFocus,
  MetaIndex,
  type ChampionAttributes,
  type ComfortStats,
} from "@ldc/engine";
import type { AdviceRecord, ChampionId, CoachStatus, DraftState, MetaSnapshot, Position, RankBandId } from "@ldc/shared";
import type { ViewState } from "../shared/view";
import type { MetaSource } from "./meta-source";
import { AdviceRecorder } from "./advice-log";
import { ImportFlow } from "./import-flow";
import { DraftSession, type DraftInputs } from "./draft-session";
import { focusView, growthFor, lastGameFor, monthFor, roleAdvice, styleFor, type LobbyViewContext } from "./lobby-views";
import { positionLabelFrom, roleLabels, uiCopy, viewLimits, withBundledWording } from "./view-copy";
import { Coach, type CoachDeps } from "./coach";
import type { LoadedConfig } from "./config";
import { queuePreviewFor } from "./role-view";
import { ClientFacts, parseRiotId } from "./client-state";
import { logProblem } from "./problem-log";
import { ProfileHealth } from "./server-problem";
import { recordInDraft } from "./draft-facts";
import { sessionView } from "./last-game-view";
import { afterGame, hasGame, missedGame, NewGameWaiter } from "./game-wait";
import type { PickCardContext } from "./pick-card";
import { ComfortCache, type PersonalProfile } from "./profile";
import type { Identity, ProfileSource } from "./profile-source";

export interface PersonalCoachDeps extends CoachDeps {
  config: LoadedConfig;
  /** Where the player's history comes from; null when neither a server nor a dev key is set up. */
  profiles: ProfileSource | null;
  /** Shown when `profiles` is null. */
  noProfileMessage?: string;
  /** Riot ID from .env ("Name#TAG"), used when the client reports no account (mock client / demo). */
  riotId: string | null;
  /** Live meta snapshots (server mode); null: score from the player's own data only (engine v1). */
  meta?: MetaSource | null;
  /** The tour and highlights already shown, in the very first state: no flash of a tour you've done. */
  ui?: ViewState["ui"];
}

export { uiCopy, viewLimits } from "./view-copy";

/**
 * Adds the personal coach on top of the live draft: gets the player's own history from
 * a ProfileSource, works out their band, and ranks their pool for each draft update.
 * Only the local player's own identity is used, and only to load their own data.
 */
export class PersonalCoach extends Coach {
  private band: RankBandId;
  private profile: PersonalProfile | null = null;
  private identity: Identity | null = null;
  private readonly comfort = new ComfortCache();
  private attributes = new Map<ChampionId, ChampionAttributes>();
  /** The live meta of the player's band (engine v2), when a snapshot is loaded. */
  private metaIndex: MetaIndex | null = null;
  /** The import button: the loadout on the card, and what the last click came to. */
  private readonly imports: ImportFlow;
  /** Your role choices in the lobby before a queue (from the client), or null. */
  private lobby: LobbyRoles | null = null;
  /** Waits for a game that just ended to reach your history. */
  private readonly gameWaiter = new NewGameWaiter({
    profiles: () => this.p.profiles,
    retrySeconds: () => this.config.app.history.newGameRetrySeconds ?? [],
    hasGame: (gameId) => hasGame(this.profile?.matches, gameId),
    pending: (waiting) => this.update({ lastGamePending: waiting }),
    gaveUp: (gaveUp) => this.update({ lastGameGaveUp: gaveUp }),
  });
  private readonly health = new ProfileHealth();
  /** The Riot ID logged into the League client (the local player's own), or null. */
  private clientRiotId: string | null = null;
  /** What the client said about your runes, champions and positions. */
  private readonly client: ClientFacts;
  /** What the coach showed when you locked in, until the game is over (the advice log). */
  private readonly recorder = new AdviceRecorder();
  /** The current champ select, and your pick until its game is over. */
  private readonly session: DraftSession;
  /** The advice log: your recent games with what the coach showed, newest first. */
  private advice: AdviceRecord[] = [];
  /** Your growth focus (main role and champion), recomputed when your games or the meta change. */
  private growth: GrowthFocus | null = null;

  /** Import buttons show when the config enables import and the client is connected. */
  private get canImport(): boolean {
    return this.config.app.import.enabled && this.p.connector.credentials !== null;
  }

  /** Called only from the player's click on an import button. */
  importLoadout(kind: "runes" | "items" | "all", pageKey?: string): Promise<void> {
    return this.imports.run(kind, pageKey);
  }

  /** Scoring config: the bundled copy at first, replaced by the server's when it arrives. */
  private config: LoadedConfig;

  constructor(private readonly p: PersonalCoachDeps) {
    super(p);
    this.config = p.config;
    this.band = p.config.bands.defaultBand;
    this.client = new ClientFacts(p.ddragon);
    this.imports = new ImportFlow({
      config: () => this.config,
      connector: p.connector,
      hasDraft: () => this.draft !== null,
      notice: (key, text) => void this.notice(key, text),
      clearNotice: (key) => this.clearNotice(key),
      redraw: () => this.onDraft(),
    });
    this.session = new DraftSession({
      connector: p.connector,
      bundled: p.config,
      imports: this.imports,
      recorder: this.recorder,
      draft: () => this.draft,
      view: () => this.view,
      update: (patch) => this.update(patch),
      notice: (key, text) => void this.notice(key, text),
      clearNotice: (key) => this.clearNotice(key),
      wording: (id) => this.wording(id),
      onStarted: () => this.retryAfterProblems(),
      redraw: () => this.onDraft(),
    });
    this.view = { ...this.view, roleLabels: roleLabels(p.config.explain.templates), copy: uiCopy(p.config.explain.templates), limits: viewLimits(p.config), ...(p.ui ? { ui: p.ui } : {}) };
  }

  /** Applies a new scoring config (from the server) and recomputes everything shown. */
  setConfig(config: LoadedConfig): void {
    this.config = withBundledWording(config, this.p.config);
    this.comfort.clear();
    this.update({ roleLabels: roleLabels(this.config.explain.templates), copy: uiCopy(this.config.explain.templates), limits: viewLimits(config, this.p.config) });
    if (this.profile) this.attributes = deriveChampionAttributes(this.profile.samples, config.engine.teamNeeds.minAttributeSamples);
    if (this.metaIndex) this.metaIndex = new MetaIndex(this.metaIndex.snapshot, config.engine.rating);
    this.updateRoleAdvice();
    this.updatePlaystyle();
    this.onDraft();
  }

  private get perks(): ClientFacts["perks"] {
    return this.client.perks;
  }

  private get shardRows(): number[][] {
    return this.client.shardRows;
  }

  private loadShardsFallback(): Promise<void> {
    return this.client.loadShardsFallback();
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
      profiles.on("status", (profile) => {
        this.update({ status: { ...this.view.status, profile } });
        this.onProfileHealth(profile);
      });
      profiles.on("band", (band) => this.setBand(band));
      profiles.on("account", (account) => this.update({ account: { ...account, clientRiotId: this.clientRiotId } }));
      profiles.on("advice", (advice) => {
        this.advice = advice;
        this.updateLastGame();
      });
      if (profiles.account) this.update({ account: { ...profiles.account, clientRiotId: this.clientRiotId } });
    }
    const { meta } = this.p;
    if (meta) {
      meta.on("snapshot", (s) => this.setSnapshot(s));
      meta.on("status", (st) => this.update({ meta: st.state === "none" ? null : st }));
      if (meta.snapshot) this.setSnapshot(meta.snapshot);
      profiles?.on("account", (a) => {
        if (a.state === "registered") this.refreshMeta(true);
      });
    }
    this.p.ddragon.on("patch", () => {
      // Champion names and icons for the lobby and the post-game card.
      this.growthInputs = [];
      this.updateFocus();
      this.updateRoleAdvice();
      this.updateLastGame();
    });
    // Shard rows from CommunityDragon once Data Dragon is loaded, when the client listed none.
    this.p.ddragon.on("patch", () => {
      if (this.p.connector.status === "connected" && !this.shardRows.length) void this.loadShardsFallback().then(() => this.onDraft());
    });
    this.p.connector.on("status", (s) => {
      if (s === "connected") void this.onClientConnected();
      else this.clearNotice("clientAccount");
    });
    this.p.connector.on("gameflowPhase", (phase) => {
      // New games are in the player's history once a game has ended (the advice for it is sent first).
      if (phase === "EndOfGame") void this.onGameEnded();
      this.session.phaseChanged(phase);
      this.onDraft();
      this.updateQueuePreview();
    });
    this.p.connector.on("lobby", (lobby) => {
      this.lobby = lobby;
      this.updateQueuePreview();
    });
    await super.start();
    // Without the League client: your games saved on this PC, then the Riot ID from .env (development).
    if (this.p.connector.status !== "connected") void (this.p.profiles?.loadSaved?.() ?? Promise.resolve()).then(() => this.loadFromRiotId());
  }

  /** The server is back after a problem: a meta that failed meanwhile needn't wait for the next champ select. */
  private onProfileHealth(profile: CoachStatus["profile"]): void {
    if (this.health.recovered(profile)) this.refreshMeta(false);
  }

  /** The Retry now link: tries again whatever failed. A meta that failed was never marked as checked, so this asks the server. */
  async retryNow(): Promise<void> {
    await Promise.all([this.p.profiles?.retry?.(), this.p.meta?.refresh(this.band)]);
  }

  private async onGameEnded(): Promise<void> {
    await afterGame(this.recorder.gameEnded(), { connector: this.p.connector, profiles: this.p.profiles, queues: this.config.app.history.queues, waiter: this.gameWaiter });
  }

  /** A champion from Data Dragon (undefined when it isn't loaded or unknown). */
  /** An item's name from Data Dragon ("#id" while it isn't loaded). */
  private itemName(id: number): string {
    try {
      return this.deps.ddragon.data.itemInfo.get(id)?.name ?? `#${id}`;
    } catch {
      return `#${id}`;
    }
  }

  /** Completed items from Data Dragon with the engine's item rules (undefined while it isn't loaded). */
  private completedItemSet(): ReadonlySet<number> | undefined {
    try {
      return completedItems(this.deps.ddragon.data.itemInfo, this.config.engine.loadout.items);
    } catch {
      return undefined;
    }
  }

  private readonly championLookup = (id: number) => {
    try {
      return this.deps.ddragon.champion(id);
    } catch {
      return undefined;
    }
  };

  private readonly positionLabel = (role: string) => positionLabelFrom(this.config.explain.templates, role);

  /** What the focus and month report were last computed from (they change only with these). */
  private growthInputs: unknown[] = [];

  /** What the lobby's tabs are worked out from. */
  private get lobbyContext(): LobbyViewContext {
    return { config: this.config, band: this.band, index: this.metaIndex, growth: this.growth, lookup: this.championLookup, positionLabel: this.positionLabel, minGames: this.view.limits.minGames };
  }

  /** Your growth focus, recomputed only when your games, the meta or the config changed. */
  private updateFocus(): void {
    if (!this.profile) return;
    const inputs = [this.profile, this.metaIndex?.snapshot, this.config, this.band];
    if (inputs.every((x, i) => x === this.growthInputs[i])) return;
    this.growthInputs = inputs;
    this.growth = growthFor(this.profile, this.lobbyContext);
    this.update({ focus: focusView(this.lobbyContext) });
    this.update({ month: monthFor(this.profile, Date.now(), this.lobbyContext) });
  }

  /** A break suggestion after a losing streak or a long session, from your own games. */
  private updateSession(): void {
    if (!this.profile) return;
    this.update({ session: sessionView(this.profile.matches, Date.now(), this.config) });
  }

  private updateLastGame(): void {
    this.update({ lastGame: lastGameFor(this.advice[0], this.profile, this.lobbyContext) });
  }

  private setProfileError(message: string): void {
    this.update({ status: { ...this.view.status, profile: { state: "error", message } } });
  }

  /**
   * The client's PUUID cannot be used with the Riot API (Riot encrypts PUUIDs per API key),
   * so we take the Riot ID from the client and let the profile source resolve it.
   */
  private async onClientConnected(): Promise<void> {
    this.clearNotice("clientAccount");
    try {
      const { me, ranked } = await this.client.read(this.p.connector);
      this.updateRoleAdvice();
      this.onDraft();
      if (ranked) this.setBand(bandFromRankedEntries(ranked.queues, this.config.bands));
      if (me?.gameName && me.tagLine) {
        this.identity = { gameName: me.gameName, tagLine: me.tagLine };
        // Your own Riot ID from the client, shown on the connect screen before you register.
        this.clientRiotId = `${me.gameName}#${me.tagLine}`;
        if (this.view.account) this.update({ account: { ...this.view.account, clientRiotId: this.clientRiotId } });
        await this.p.profiles?.load(this.identity, { bandFromApi: !ranked });
        // A game that ended while the panel was closed (or before Riot published it) isn't in the history yet: wait for it.
        const missed = await missedGame(this.p.connector, this.config.app.history.queues, this.profile?.matches);
        if (missed !== null) void this.gameWaiter.wait(missed);
      } else await this.loadFromRiotId(); // e.g. the mock client, which has no account
    } catch (err) {
      if (this.notice("clientAccount", this.wording("notice.clientAccount"))) logProblem(`Reading the client account: ${(err as Error).message}`);
    }
  }

  /** Fallback when the client isn't running or has no account: RIOT_ID from .env. */
  private async loadFromRiotId(): Promise<void> {
    const { riotId, profiles } = this.p;
    if (!profiles || !riotId || this.identity) return;
    const identity = parseRiotId(riotId);
    if (!identity) return this.setProfileError(`RIOT_ID must look like "Name#TAG", in quotes (got "${riotId}")`);
    this.identity = identity;
    await profiles.load(identity, { bandFromApi: true });
  }

  private setBand(band: RankBandId): void {
    const changed = band !== this.band;
    this.band = band;
    this.update({ status: { ...this.view.status, band } });
    if (changed && this.metaIndex && this.metaIndex.snapshot.band !== band) this.setSnapshot(null);
    this.refreshMeta(false);
    this.onDraft();
  }

  /** Asks for the band's snapshot (cached copy first; the server at most every 30 minutes unless forced). */
  private refreshMeta(force: boolean): void {
    void this.p.meta?.refresh(this.band, { force });
  }

  private setSnapshot(snapshot: MetaSnapshot | null): void {
    if (snapshot && snapshot.band !== this.band) return;
    this.metaIndex = snapshot ? new MetaIndex(snapshot, this.config.engine.rating) : null;
    this.updateFocus();
    this.updateRoleAdvice();
    this.updatePlaystyle();
    this.updateLastGame();
    this.onDraft();
  }

  /** Measured champion attributes: the band's (big sample) when loaded, else from the player's own games. */
  private get attrs(): Map<ChampionId, ChampionAttributes> {
    return this.metaIndex ? new Map([...this.attributes, ...this.metaIndex.attributes]) : this.attributes;
  }

  private setProfile(profile: PersonalProfile): void {
    const { engine } = this.config;
    const first = this.profile === null;
    this.profile = profile;
    this.comfort.clear();
    this.attributes = deriveChampionAttributes(this.profile.samples, engine.teamNeeds.minAttributeSamples);
    this.updateFocus();
    this.updateSession();
    this.updateRoleAdvice();
    this.updatePlaystyle();
    this.updateLastGame();
    if (first) this.refreshMeta(false);
    this.onDraft();
  }

  private updatePlaystyle(): void {
    if (this.profile) this.update(styleFor(this.profile, Date.now(), this.lobbyContext));
  }

  private updateRoleAdvice(): void {
    if (!this.profile) return;
    const context = {
      ...this.lobbyContext,
      now: Date.now(),
      attributes: () => this.attrs,
      intendedPositions: this.client.intendedPositions,
      owned: this.client.owned,
      comfortFor: (role: Position) => this.comfortFor(role),
      itemName: (id: number) => this.itemName(id),
      completedItems: () => this.completedItemSet(),
    };
    this.update(roleAdvice(this.profile, context));
    this.updateQueuePreview();
  }

  /** Comfort for a role, cached until the profile changes. */
  private comfortFor(role: Position | null): Map<ChampionId, ComfortStats> {
    return this.comfort.get(role, this.profile!, this.config.engine.comfort);
  }

  /** A problem from earlier gets another try when it matters most. */
  private retryAfterProblems(): void {
    this.refreshMeta(false);
    void this.p.profiles?.retry?.();
  }

  /** The Next game tab, while it's wanted. */
  private updateQueuePreview(): void {
    const preview = !this.profile
      ? null
      : queuePreviewFor(this.lobby, this.session.clientPhase, this.draft, {
          owned: this.client.owned,
          comfortFor: (position) => this.comfortFor(position),
          attributes: this.attributes,
          intendedPositions: this.client.intendedPositions,
          config: this.config,
          band: this.band,
          index: this.metaIndex,
          lookup: this.championLookup,
        });
    if (preview || this.view.queuePreview) this.update({ queuePreview: preview });
  }

  protected override onDraft(): void {
    super.onDraft();
    this.session.render(this.draftInputs());
  }

  private draftInputs(): DraftInputs {
    return {
      profile: this.profile,
      index: this.metaIndex,
      config: this.config,
      band: this.band,
      attributes: this.attributes,
      intendedPositions: this.client.intendedPositions,
      comfortFor: (role) => this.comfortFor(role),
      cardContext: (live, draft, role, profile) => this.cardContext(live, draft, role, profile),
    };
  }

  /** What champ select's cards need from the coach right now. */
  private cardContext(live: PickCardContext["live"], draft: DraftState, role: Position | null, profile: PersonalProfile): PickCardContext {
    const lookup = this.championLookup;
    const nameOf = (id: number) => lookup(id)?.name ?? `#${id}`;
    let data: PickCardContext["data"] = null;
    try {
      data = this.deps.ddragon.data;
    } catch {
      // Data Dragon not loaded yet: names fall back to ids.
    }
    return {
      live,
      draft,
      index: this.metaIndex,
      role,
      matches: profile.matches,
      config: this.config,
      bands: this.config.bands,
      band: this.band,
      data,
      lookup,
      say: (r) => renderReason(r, this.config.explain.templates, nameOf, { item: (id) => this.itemName(id) }),
      canImport: this.canImport,
      perk: (id) => this.perks.get(id),
      shardRows: this.shardRows,
      recordVsLane: (championId) => recordInDraft(this.draft, this.metaIndex, profile.matches, championId, role),
    };
  }
}
