import { LcuImporter, type LobbyRoles } from "@ldc/lcu";
import {
  adviseRoles,
  completedItems,
  bandFromRankedEntries,
  computeComfort,
  deriveChampionAttributes,
  advisePicks,
  analyzePool,
  sideSplit,
  mainRole,
  renderReason,
  adviseLivePicks,
  assessPick,
  focusAfterLastGame,
  learningPlan,
  recommendNewChampions,
  monthlyReport,
  type GrowthFocus,
  MetaIndex,
  type ChampionAttributes,
  type RolePool,
  type ComfortStats,
  type Loadout,
} from "@ldc/engine";
import type { AdviceRecord, ChampionId, DraftState, MetaSnapshot, PickAdvice, Position, RankBandId, Reason } from "@ldc/shared";
import type { MyPickView, NewChampRoleView } from "../shared/view";
import type { MetaSource } from "./meta-source";
import { AdviceRecorder, adviceOption } from "./advice-log";
import { importShownLoadout } from "./loadout-import";
import { growthFocusView } from "./focus-view";
import { newChampsView } from "./newchamps-view";
import { monthView } from "./month-view";
import { playstyleViews, sideView } from "./style-view";
import { Coach, type CoachDeps } from "./coach";
import type { LoadedConfig } from "./config";
import { champView } from "./draft-view";
import { capital } from "./reason-view";
import { adviceNotes, pickViews, queuePreviewRoles, roleView } from "./role-view";
import { readClientState } from "./client-state";
import { banningNow, draftScoring, laneOpponent, lockedPick, queuePreviewWanted, queueSupported, recordVsLane } from "./draft-facts";
import { lastGameView, sessionView } from "./last-game-view";
import { currentGame, hasGame, lastClientGame, NewGameWaiter } from "./game-wait";
import { banViews, cardLoadout, draftNotes, pickCardView, type PickCardContext } from "./pick-card";
import { profileFromMatches, type PersonalProfile } from "./profile";
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
}

/** The panel's fixed wording: explain templates "ui.*", without the prefix. */
export function uiCopy(templates: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(templates).flatMap(([k, v]) => (k.startsWith("ui.") ? [[k.slice(3), v]] : [])));
}

/** Position names from the explain templates ("role.utility": "support"). */
export function roleLabels(templates: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(templates).flatMap(([k, v]) => (k.startsWith("role.") ? [[k.slice(5), v]] : [])));
}

/** Client phases where a game is starting or running: the locked-in loadout stays only then. */
const GAME_PHASES = new Set(["ChampSelect", "GameStart", "InProgress", "Reconnect"]);

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
  /** The live meta of the player's band (engine v2), when a snapshot is loaded. */
  private metaIndex: MetaIndex | null = null;
  /** The loadout shown in the Your pick card, for the import buttons. */
  private shownLoadout: { loadout: Loadout; champion: string } | null = null;
  private importMessage: string | null = null;
  /** The client's gameflow phase, as this coach last heard it ("" before the first). */
  private clientPhase = "";
  /** Your role choices in the lobby before a queue (from the client), or null. */
  private lobby: LobbyRoles | null = null;
  /** Waits for a game that just ended to reach your history. */
  private readonly gameWaiter = new NewGameWaiter({
    profiles: () => this.p.profiles,
    retrySeconds: () => this.config.app.history.newGameRetrySeconds ?? [],
    hasGame: (gameId) => hasGame(this.profile?.matches, gameId),
    pending: (waiting) => this.update({ lastGamePending: waiting }),
  });
  /** The Riot ID logged into the League client (the local player's own), or null. */
  private clientRiotId: string | null = null;
  /**
   * The last "Your pick" card, kept after champ select ends (champ select often closes
   * seconds after you lock in, e.g. in custom games) until the game is over.
   */
  private keptPick: MyPickView | null = null;
  /** Rune and stat shard names from the client (Data Dragon has no shards), with mirror icons. */
  private perks = new Map<number, { name: string; iconUrl: string | null }>();
  /** The stat shard rows (offense, flex, defense) from the client, for drawing the whole rune page. */
  private shardRows: number[][] = [];
  /** What the coach showed when you locked in, until the game is over (the advice log). */
  private readonly recorder = new AdviceRecorder();
  /** The advice log: your recent games with what the coach showed, newest first. */
  private advice: AdviceRecord[] = [];
  /** Your growth focus (main role and champion), recomputed when your games or the meta change. */
  private growth: GrowthFocus | null = null;
  /** Champions you own, from the client (null until read: ownership unknown). */
  private owned: Set<ChampionId> | null = null;
  /** The queue of the current champ select (from the gameflow session). */
  private queueId: number | null = null;

  /** Import buttons show when the config enables import and the client is connected. */
  private get canImport(): boolean {
    return this.config.app.import.enabled && this.p.connector.credentials !== null;
  }

  /**
   * Writes the shown loadout into the League client: "runes" = the rune page and your two
   * summoner spells, "items" = the item set, "all" = both, one after the other (the panel's one
   * import button). Called only from the player's click on an import button (CLAUDE.md: the single
   * approved LCU write exception).
   */
  async importLoadout(kind: "runes" | "items" | "all"): Promise<void> {
    const shown = this.shownLoadout;
    const creds = this.p.connector.credentials;
    if (!shown || !creds || !this.config.app.import.enabled) return;
    this.importMessage = await importShownLoadout(kind, shown, new LcuImporter(creds), this.config);
    this.onDraft();
  }
  /** Scoring config: the bundled copy at first, replaced by the server's when it arrives. */
  private config: LoadedConfig;

  constructor(private readonly p: PersonalCoachDeps) {
    super(p);
    this.config = p.config;
    this.band = p.config.bands.defaultBand;
    this.view = { ...this.view, roleLabels: roleLabels(p.config.explain.templates), copy: uiCopy(p.config.explain.templates) };
  }

  /** Applies a new scoring config (from the server) and recomputes everything shown. */
  setConfig(config: LoadedConfig): void {
    // Wording the server doesn't have yet (an older server) falls back to the bundled copy, never to raw ids.
    const local = this.p.config.explain;
    this.config = { ...config, explain: { ...config.explain, templates: { ...local.templates, ...config.explain.templates }, tips: { ...local.tips, ...config.explain.tips } } };
    this.comfortByRole.clear();
    this.update({ roleLabels: roleLabels(this.config.explain.templates), copy: uiCopy(this.config.explain.templates) });
    if (this.profile) this.attributes = deriveChampionAttributes(this.profile.samples, config.engine.teamNeeds.minAttributeSamples);
    if (this.metaIndex) this.metaIndex = new MetaIndex(this.metaIndex.snapshot, config.engine.rating);
    this.updateRoleAdvice();
    this.updatePlaystyle();
    this.onDraft();
  }

  /** Stat shards from CommunityDragon when the client doesn't list them (an older client, the mock client). */
  private async loadShardsFallback(): Promise<void> {
    const s = await this.deps.ddragon.statShards().catch(() => null);
    if (!s) return;
    this.shardRows = s.rows;
    for (const [id, p] of s.perks) if (!this.perks.has(id)) this.perks.set(id, p);
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
    });
    this.p.connector.on("gameflowPhase", (phase) => {
      if (phase === "InProgress") void this.onGameStarted();
      if (["Lobby", "None", "Matchmaking", "ReadyCheck"].includes(phase)) this.recorder.leftChampSelect();
      // New games are in the player's history once a game has ended (the advice for it is sent first).
      if (phase === "EndOfGame") void this.onGameEnded();
      this.clientPhase = phase;
      // The kept loadout is for the game being played: drop it as soon as the client is anywhere else.
      if (!GAME_PHASES.has(phase)) this.keptPick = null;
      this.onDraft();
      this.updateQueuePreview();
    });
    this.p.connector.on("lobby", (lobby) => {
      this.lobby = lobby;
      this.updateQueuePreview();
    });
    await super.start();
    // Without the League client, fall back to the Riot ID from .env.
    if (this.p.connector.status !== "connected") void this.loadFromRiotId();
  }

  /** The game started: its id ties the advice shown in champ select to the game in your history. */
  private async onGameStarted(): Promise<void> {
    const { gameId, queueId } = await currentGame(this.p.connector);
    this.recorder.gameStarted(gameId, queueId);
  }

  private async onGameEnded(): Promise<void> {
    const record = this.recorder.gameEnded();
    if (record) await this.p.profiles?.recordAdvice(record).catch(() => {});
    // The game just played: from the advice log, else the client's own last game.
    const gameId = record?.gameId ?? (await lastClientGame(this.p.connector, this.config.app.history.queues))?.gameId ?? null;
    if (gameId !== null) await this.gameWaiter.wait(gameId);
    else await this.p.profiles?.refresh();
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

  /** "Mid", "Jungle": the role's label from config, capitalised. */
  private readonly positionLabel = (role: string) => {
    const label = roleLabels(this.config.explain.templates)[role] ?? role;
    return capital(label);
  };

  /** What the focus and month report were last computed from (they change only with these). */
  private growthInputs: unknown[] = [];

  /**
   * Your growth focus: on the role of your last game (each role has its own goals: vision for a
   * support, early farm and ganks for a jungler), even from your first games there.
   * From your games and the band's references.
   */
  private updateFocus(): void {
    if (!this.profile) return;
    const inputs = [this.profile, this.metaIndex?.snapshot, this.config, this.band];
    if (inputs.every((x, i) => x === this.growthInputs[i])) return;
    this.growthInputs = inputs;
    this.growth = focusAfterLastGame(this.profile.matches, mainRole(this.profile.games), this.config.engine, (role) => this.metaIndex?.snapshot.references[role]);
    const championName = (id: number) => this.championLookup(id)?.name ?? `#${id}`;
    this.update({ focus: growthFocusView(this.growth, { config: this.config, band: this.metaIndex ? this.band : null, championName, positionLabel: this.positionLabel }) });
    this.updateMonth();
  }

  /** Your own games on this champion in this role against your lane opponent's champion (none: nothing to say). */
  private recordVsLane(profile: PersonalProfile, championId: number, role: Position | null): Reason[] {
    const enemy = this.draft && role ? laneOpponent(this.draft, role, this.metaIndex) : null;
    return recordVsLane(profile.matches, championId, role, enemy);
  }

  /** A break suggestion after a losing streak or a long session, from your own games. */
  private updateSession(): void {
    if (!this.profile) return;
    this.update({ session: sessionView(this.profile.matches, Date.now(), this.config) });
  }

  /** The monthly report: your last month against the month before, from your own games. */
  private updateMonth(): void {
    if (!this.profile) return;
    const { engine, explain } = this.config;
    const report = monthlyReport(this.profile.matches, Date.now(), engine, {
      bands: this.config.bands,
      rankHistory: this.profile.rankHistory,
      references: (role) => this.metaIndex?.snapshot.references[role],
    });
    const lookup = this.championLookup;
    this.update({
      month: monthView(report, {
        explain,
        champion: (id) => champView(id, lookup),
        positionLabel: this.positionLabel,
        growth: this.growth,
      }),
    });
  }

  /** The post-game card: your newest game, with what the coach showed for it when it was there. */
  private updateLastGame(): void {
    const { explain, engine } = this.config;
    this.update({ lastGame: lastGameView(this.advice[0], this.profile?.matches ?? [], this.growth, { explain, minDeltaWin: engine.rating.explain.minDeltaWin, lookup: this.championLookup }) });
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
      const { me, ranked, intendedPositions, perks, shardRows, owned } = await readClientState(this.p.connector);
      this.intendedPositions = intendedPositions;
      this.perks = perks;
      this.shardRows = shardRows;
      this.owned = owned;
      if (!this.shardRows.length) await this.loadShardsFallback();
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
        const last = await lastClientGame(this.p.connector, this.config.app.history.queues);
        if (last && this.profile && !hasGame(this.profile.matches, last.gameId)) void this.gameWaiter.wait(last.gameId);
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
    this.comfortByRole.clear();
    this.attributes = deriveChampionAttributes(this.profile.samples, engine.teamNeeds.minAttributeSamples);
    this.updateFocus();
    this.updateSession();
    this.updateRoleAdvice();
    this.updatePlaystyle();
    this.updateLastGame();
    if (first) this.refreshMeta(false);
    this.onDraft();
  }

  /** Playstyle per role (lobby Style tab) and your side split. */
  private updatePlaystyle(): void {
    if (!this.profile) return;
    const { engine, explain } = this.config;
    const views = playstyleViews(this.profile.matches, Date.now(), engine, explain, (role) => this.metaIndex?.snapshot.references[role], (id) => this.championLookup(id)?.tags);
    this.update({ playstyle: views, side: engine.style ? sideView(sideSplit(this.profile.matches, engine.style.side), explain) : null });
  }

  private updateRoleAdvice(): void {
    if (!this.profile) return;
    const { engine, explain } = this.config;
    const newChamps: NewChampRoleView[] = [];
    const roles = adviseRoles(this.profile.games, this.profile.masteries, Date.now(), engine, this.intendedPositions, this.attrs).map((r) => {
      const pool = r.enoughData
        ? analyzePool({
            role: r.role,
            comfort: this.comfortFor(r.role),
            masteries: this.profile!.masteries,
            matches: this.profile!.matches,
            attributes: this.attrs,
            intendedPositions: this.intendedPositions,
            now: Date.now(),
            config: engine,
            ...(this.metaIndex ? { rolePicks: this.metaIndex.championsIn(r.role) } : {}),
          })
        : null;
      if (pool && this.metaIndex) newChamps.push(this.newChampsFor(r.role, pool, this.metaIndex));
      return roleView(r, pool, { attributes: this.attrs, coverage: engine.pool.coverage, templates: explain.templates, lookup: this.championLookup });
    });
    this.update({ roles, newChamps });
    this.updateQueuePreview();
  }

  /** The New tab for one role: champions to learn there, each with its plan. */
  private newChampsFor(role: Position, pool: RolePool, index: MetaIndex): NewChampRoleView {
    const profile = this.profile!;
    const { engine, explain } = this.config;
    const lookup = this.championLookup;
    const played = new Map<ChampionId, number>();
    for (const g of profile.games) if (g.position === role) played.set(g.championId, (played.get(g.championId) ?? 0) + 1);
    const advice = recommendNewChampions({
      role,
      pool,
      playedInRole: played,
      masteries: profile.masteries,
      index,
      champions: (id) => lookup(id),
      attributes: this.attrs,
      owned: this.owned,
      config: engine.newChamps,
      coverage: engine.pool.coverage,
    });
    return newChampsView(advice, {
      explain,
      champion: (id) => champView(id, lookup),
      championName: (id) => lookup(id)?.name ?? `#${id}`,
      itemName: (id) => this.itemName(id),
      planGames: engine.newChamps.planGames,
      learn: { profile: engine.newChamps.learn.profile, laneGoldEven: engine.rating.explain.laneGoldGap },
      blockGames: engine.newChamps.learn.blockGames,
      plan: (id) =>
        learningPlan({
          championId: id,
          role,
          matches: profile.matches,
          index,
          champion: lookup(id),
          goal: this.growth?.focus ? { role: this.growth.role, ...this.growth.focus } : null,
          completed: this.completedItemSet(),
          config: engine,
        }),
    });
  }

  /** Comfort for a role, cached until the profile changes. */
  private comfortFor(role: Position | null): Map<ChampionId, ComfortStats> {
    const key = role ?? "";
    let comfort = this.comfortByRole.get(key);
    if (!comfort) {
      comfort = computeComfort(this.profile!.games, this.profile!.masteries, Date.now(), this.config.engine.comfort, role);
      this.comfortByRole.set(key, comfort);
    }
    return comfort;
  }

  /** On a new champ select: read which champions are pickable and whether the queue is supported. */
  private async onChampSelectStart(): Promise<void> {
    const { connector, config } = this.p;
    this.refreshMeta(false);
    this.pickable = await connector.getPickableChampionIds().catch(() => []);
    const { queueId } = await currentGame(connector);
    this.queueId = queueId;
    this.queueSupported = queueSupported(this.draft, queueId, config.app.supportedQueues);
    if (!this.queueSupported) this.notice("This queue isn't supported yet — suggestions are for Ranked and Normal Draft.");
    this.onDraft();
  }

  private hadDraft = false;

  /**
   * In the lobby with roles chosen: your best picks for each, ranked as a blind pick (nobody else
   * has picked yet), so you can plan before the queue pops. Champ select replaces it with the real draft.
   */
  private updateQueuePreview(): void {
    const l = this.lobby;
    if (!l || !this.profile || this.draft || !queuePreviewWanted(l, this.clientPhase, this.config.app.supportedQueues)) {
      if (this.view.queuePreview) this.update({ queuePreview: null });
      return;
    }
    const roles = queuePreviewRoles(l.positions, {
      owned: this.owned,
      comfortFor: (position) => this.comfortFor(position),
      attributes: this.attributes,
      intendedPositions: this.intendedPositions,
      config: this.config,
      band: this.band,
      index: this.metaIndex,
      lookup: this.championLookup,
    });
    this.update({ queuePreview: { roles } });
  }

  protected override onDraft(): void {
    super.onDraft();
    if (this.draft && !this.hadDraft) {
      this.keptPick = null; // a new champ select: the last game's pick no longer applies
      this.recorder.newChampSelect();
      void this.onChampSelectStart();
    }
    this.hadDraft = this.draft !== null;
    // While your history loads, bans still come from the live meta alone (picks wait for your history).
    const loading = !this.profile && this.draft !== null && this.queueSupported && this.metaIndex !== null && banningNow(this.draft);
    const profile = this.profile ?? (loading ? profileFromMatches([], []) : null);
    if (!this.draft || !profile || !this.queueSupported) return this.showNoDraft();
    const draft = this.draft;
    const { engine } = this.config;
    const { role, input, filled, live } = draftScoring({
      draft,
      games: profile.games,
      loading,
      pickable: this.pickable,
      comfortFor: (r) => this.comfortFor(r),
      attributes: this.attributes,
      intendedPositions: this.intendedPositions,
      band: this.band,
      engine,
      index: this.metaIndex,
    });
    const ctx = this.cardContext(live, draft, role, profile);
    const { say, lookup } = ctx;

    const { enemyNotes, lane, filledNote } = draftNotes(draft, role, live, filled, ctx);

    // Locked in: no more suggestions; show the player's own pick (and, with live meta, how it looks in this draft).
    const locked = lockedPick(draft);
    if (locked !== null) {
      const assessed = live ? assessPick(live, locked) : null;
      this.recorder.locked(adviceOption(assessed ?? { championId: locked }), { role, band: this.band, queueId: this.queueId, now: Date.now() });
      this.update({ picks: [], bans: [], hoverBans: null, hoverPick: null, pickAdvice: { whyNot: null, confidence: null }, pickRole: role, laneOpponent: lane, enemyNotes, filledNote: null, myPick: this.card(locked, false, ctx) });
      this.keptPick = this.view.myPick;
      return;
    }
    const advice: PickAdvice = live ? adviseLivePicks(live) : advisePicks(input, this.config.explain.settings);
    this.recorder.shown(advice.picks.map(adviceOption));
    const { bans, hoverBans } = live !== null && banningNow(draft) ? banViews(live, ctx) : { bans: [], hoverBans: null };
    // Hovering (or selected, not locked yet): its loadout already, so there's time to read and import it.
    const me = draft.myTeam.find((s) => s.isLocalPlayer);
    const pending = me ? me.championId || me.pickIntentId : 0;
    const hoverCard = live && pending > 0 ? this.card(pending, true, ctx) : null;
    if (!hoverCard?.loadout) this.shownLoadout = null;
    if (loading) return this.update({ picks: [], pickAdvice: { whyNot: null, confidence: null }, bans, hoverBans, myPick: null, hoverPick: null, pickRole: role, laneOpponent: lane, enemyNotes, filledNote: null });
    const pickAdvice = { ...adviceNotes(advice, say), minGames: engine.rating.minGames };
    this.update({ picks: pickViews(advice.picks, lookup, say), pickAdvice, bans, hoverBans, myPick: null, hoverPick: hoverCard?.loadout ? hoverCard : null, pickRole: role, laneOpponent: lane, enemyNotes, filledNote });
  }

  /** Out of champ select (or no history, or a queue we don't coach): your pick stays while the game it's for is on. */
  private showNoDraft(): void {
    this.shownLoadout = null;
    // Out of champ select: keep showing your pick and its loadout (import only works in champ select).
    const inGame = GAME_PHASES.has(this.clientPhase);
    const kept = this.draft || !inGame ? null : this.keptPick && { ...this.keptPick, importMessage: null, loadout: this.keptPick.loadout && { ...this.keptPick.loadout, canImport: false } };
    this.update({ picks: [], bans: [], hoverBans: null, hoverPick: null, myPick: kept, pickAdvice: { whyNot: null, confidence: null }, pickRole: this.profile ? mainRole(this.profile.games) : null, laneOpponent: null, enemyNotes: [], filledNote: null });
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
      recordVsLane: (championId) => this.recordVsLane(profile, championId, role),
    };
  }

  /** The card for a champion, keeping its loadout for the import button (a message from an earlier import goes with another champion). */
  private card(championId: ChampionId, hovering: boolean, ctx: PickCardContext): MyPickView {
    const loadout = cardLoadout(championId, ctx);
    if (this.shownLoadout?.loadout.championId !== championId) this.importMessage = null;
    const nameOf = (id: number) => ctx.lookup(id)?.name ?? `#${id}`;
    this.shownLoadout = loadout ? { loadout, champion: nameOf(championId) } : null;
    return pickCardView(championId, hovering, loadout, this.importMessage, ctx);
  }
}
