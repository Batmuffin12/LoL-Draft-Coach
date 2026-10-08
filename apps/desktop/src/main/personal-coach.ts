import { communityDragonAsset } from "@ldc/ddragon";
import { LcuImporter, unavailableChampions } from "@ldc/lcu";
import {
  adviseRoles,
  bandFromRankedEntries,
  computeComfort,
  deriveChampionAttributes,
  draftRole,
  advisePicks,
  analyzePool,
  computePlaystyle,
  formatMetric,
  metricLabel,
  playstyleRoles,
  mainRole,
  renderReason,
  weightsForBand,
  adviseLivePicks,
  assessPick,
  draftLoadout,
  pickFocus,
  learningPlan,
  powerSpikes,
  recommendNewChampions,
  monthlyReport,
  sessionCheck,
  gamePlan,
  enemyTeamNotes,
  type GrowthFocus,
  completedItems,
  completedBoots,
  personalBuild,
  suggestBans,
  suggestHoverBans,
  placeDraft,
  MetaIndex,
  type ChampionAttributes,
  type ComfortStats,
  type Loadout,
} from "@ldc/engine";
import type { AdviceRecord, BanSuggestion, ChampionId, DraftState, MetaSnapshot, PickAdvice, Position, RankBandId, Reason } from "@ldc/shared";
import type { BanView, MyPickView, NewChampRoleView, PickView, PlaystyleView } from "../shared/view";
import type { MetaSource } from "./meta-source";
import { AdviceRecorder, adviceOption, postGameView } from "./advice-log";
import { importLoadout } from "./loadout-import";
import { focusInGame, focusView } from "./focus-view";
import { newChampsView } from "./newchamps-view";
import { monthView } from "./month-view";
import { Coach, type CoachDeps } from "./coach";
import type { LoadedConfig } from "./config";
import { champView } from "./draft-view";
import { toLoadoutView } from "./loadout-view";
import { capital, reasonView } from "./reason-view";
import { banNumbers, draftMatchups } from "./stats-view";
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

/** Position names from the explain templates ("role.utility": "support"). */
export function roleLabels(templates: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(templates).flatMap(([k, v]) => (k.startsWith("role.") ? [[k.slice(5), v]] : [])));
}

/** The champion the local player has locked in (their pick action is completed), or null. */
export function lockedPick(draft: DraftState): ChampionId | null {
  const action = draft.actions.find((a) => a.type === "pick" && a.actorCellId === draft.localCellId && a.completed && a.championId > 0);
  if (action) return action.championId;
  // After the pick phase (finalization), the seat's champion is final even if actions are trimmed.
  const me = draft.myTeam.find((s) => s.isLocalPlayer);
  return draft.timerPhase === "FINALIZATION" && me && me.championId > 0 ? me.championId : null;
}

/**
 * The enemy most likely in your lane, or null before they pick. The client doesn't say enemy
 * roles: with the band's meta, the engine assigns them (draft-roles); without it, only an enemy
 * seat that shows your position counts.
 */
export function laneOpponent(draft: DraftState, role: Position, index: MetaIndex | null): ChampionId | null {
  if (index) return placeDraft(draft, index, role).enemies.find((e) => e.role === role)?.championId ?? null;
  return draft.theirTeam.find((s) => s.position === role && s.championId > 0)?.championId ?? null;
}

/** The local player is banning right now, or the draft is in the planning phase before bans. */
function banningNow(draft: DraftState): boolean {
  if (draft.timerPhase === "PLANNING") return true;
  return draft.actions.some((a) => a.inProgress && !a.completed && a.type === "ban" && a.actorCellId === draft.localCellId);
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
  /** The live meta of the player's band (engine v2), when a snapshot is loaded. */
  private metaIndex: MetaIndex | null = null;
  /** The loadout shown in the Your pick card, for the import buttons. */
  private shownLoadout: { loadout: Loadout; champion: string } | null = null;
  private importMessage: string | null = null;
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
   * summoner spells (one button), "items" = the item set. Called only from the player's click on
   * an import button (CLAUDE.md: the single approved LCU write exception).
   */
  async importLoadout(kind: "runes" | "items"): Promise<void> {
    const shown = this.shownLoadout;
    const creds = this.p.connector.credentials;
    if (!shown || !creds || !this.config.app.import.enabled) return;
    const { templates } = this.config.explain;
    const say = (id: string, slots: Record<string, string | number> = {}) => renderReason({ id, slots }, templates, String);
    const importer = new LcuImporter(creds);
    try {
      this.importMessage = await importLoadout(kind, shown, importer, { say, mapId: Number(this.config.engine.loadout.items.mapId) });
    } finally {
      importer.close();
    }
    this.onDraft();
  }
  /** Scoring config: the bundled copy at first, replaced by the server's when it arrives. */
  private config: LoadedConfig;

  constructor(private readonly p: PersonalCoachDeps) {
    super(p);
    this.config = p.config;
    this.band = p.config.bands.defaultBand;
    this.view = { ...this.view, roleLabels: roleLabels(p.config.explain.templates) };
  }

  /** Applies a new scoring config (from the server) and recomputes everything shown. */
  setConfig(config: LoadedConfig): void {
    // Wording the server doesn't have yet (an older server) falls back to the bundled copy, never to raw ids.
    this.config = { ...config, explain: { ...config.explain, templates: { ...this.p.config.explain.templates, ...config.explain.templates } } };
    this.comfortByRole.clear();
    this.update({ roleLabels: roleLabels(this.config.explain.templates) });
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
      profiles.on("account", (account) => this.update({ account }));
      profiles.on("advice", (advice) => {
        this.advice = advice;
        this.updateLastGame();
      });
      if (profiles.account) this.update({ account: profiles.account });
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
      // The kept loadout is for the game being played: drop it once that game is over or left.
      if (["EndOfGame", "Lobby", "None"].includes(phase) && this.keptPick) {
        this.keptPick = null;
        this.onDraft();
      }
    });
    await super.start();
    // Without the League client, fall back to the Riot ID from .env.
    if (this.p.connector.status !== "connected") void this.loadFromRiotId();
  }

  /** The game started: its id ties the advice shown in champ select to the game in your history. */
  private async onGameStarted(): Promise<void> {
    const session = await this.p.connector.getGameflowSession().catch(() => null);
    this.recorder.gameStarted(session?.gameData?.gameId ?? null, session?.gameData?.queue?.id ?? null);
  }

  private async onGameEnded(): Promise<void> {
    const record = this.recorder.gameEnded();
    if (record) await this.p.profiles?.recordAdvice(record).catch(() => {});
    await this.p.profiles?.refresh();
  }

  /** A champion from Data Dragon (undefined when it isn't loaded or unknown). */
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

  /** Your growth focus: on your main role (and champion), from your games and the band's references. */
  private updateFocus(): void {
    if (!this.profile) return;
    const inputs = [this.profile, this.metaIndex?.snapshot, this.config, this.band];
    if (inputs.every((x, i) => x === this.growthInputs[i])) return;
    this.growthInputs = inputs;
    const { engine, explain } = this.config;
    const role = mainRole(this.profile.games);
    this.growth = role ? pickFocus(this.profile.matches, role, engine, this.metaIndex?.snapshot.references[role]) : null;
    const lookup = (id: number) => this.championLookup(id)?.name ?? `#${id}`;
    const view = this.growth
      ? focusView(this.growth, {
          explain,
          targetStep: engine.growth.targetStep,
          checkGames: engine.growth.checkGames,
          bandName: this.metaIndex ? (this.config.bands.bands.find((b) => b.id === this.band)?.name ?? null) : null,
          championName: lookup,
          positionLabel: this.positionLabel,
        })
      : null;
    this.update({ focus: view });
    this.updateMonth();
  }

  /** Your own games on this champion in this role against your lane opponent's champion (none: nothing to say). */
  private recordVsLane(profile: PersonalProfile, championId: number, role: Position | null): Reason[] {
    const enemy = this.draft && role ? laneOpponent(this.draft, role, this.metaIndex) : null;
    if (!enemy || !role) return [];
    let wins = 0;
    let losses = 0;
    for (const m of profile.matches) {
      const me = m.match.participants[m.me];
      if (!me || me.championId !== championId || me.position !== role) continue;
      if (!m.match.participants.some((p) => p.teamId !== me.teamId && p.position === role && p.championId === enemy)) continue;
      if (me.win) wins++;
      else losses++;
    }
    return wins + losses ? [{ id: "plan.record", slots: { enemy, wins, losses } }] : [];
  }

  /** A break suggestion after a losing streak or a long session, from your own games. */
  private updateSession(): void {
    if (!this.profile) return;
    const { engine, explain } = this.config;
    const check = sessionCheck(this.profile.matches, Date.now(), engine.session);
    if (!check) return this.update({ session: null });
    const say = (id: string, slots: Record<string, string | number>) => renderReason({ id, slots }, explain.templates, (id) => `#${id}`);
    const lastEnded = Math.max(...this.profile.matches.map((m) => m.match.endedAt));
    this.update({
      session: {
        text: check.reason === "losses" ? say("session.losses", { streak: check.lossStreak }) : say("session.long", { games: check.games }),
        record: check.record
          ? say("session.record", { streak: check.record.afterStreak, winRate: check.record.winRate, games: check.record.games, overall: check.record.overallWinRate })
          : null,
        until: lastEnded + engine.session.gapMinutes * 60_000,
      },
    });
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

  /** The post-game card: your newest logged game, joined with your history for its result. */
  private updateLastGame(): void {
    const latest = this.advice[0];
    if (!latest) return this.update({ lastGame: null });
    const lookup = this.championLookup;
    const view = postGameView(latest, this.profile?.matches ?? [], {
      templates: this.config.explain.templates,
      minDeltaWin: this.config.engine.rating.explain.minDeltaWin,
      champion: (id) => champView(id, lookup),
      championName: (id) => lookup(id)?.name ?? `#${id}`,
      focus: (matchId) => focusInGame(this.growth, matchId, this.profile?.matches ?? [], this.config.explain),
    });
    this.update({ lastGame: view });
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
      const perks = await this.p.connector.getPerks().catch(() => []);
      this.perks = new Map(perks.map((p) => [p.id, { name: p.name, iconUrl: communityDragonAsset(p.iconPath) }]));
      this.shardRows = await this.p.connector.getStatShardRows().catch(() => []);
      const owned = await this.p.connector.getOwnedChampionIds().catch(() => []);
      this.owned = owned.length ? new Set(owned) : null;
      if (!this.shardRows.length) await this.loadShardsFallback();
      this.updateRoleAdvice();
      this.onDraft();
      if (ranked) this.setBand(bandFromRankedEntries(ranked.queues, this.config.bands));
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

  /** Playstyle per role (lobby card): percentiles against others in the role in the player's own games. */
  private updatePlaystyle(): void {
    if (!this.profile) return;
    const { engine, explain } = this.config;
    const now = Date.now();
    const level = (s: number) => (s >= explain.settings.playstyleHigh ? "high" : s <= explain.settings.playstyleLow ? "low" : "mid") as "high" | "mid" | "low";
    const views: PlaystyleView[] = [];
    for (const role of playstyleRoles(this.profile.matches, engine.playstyle).slice(0, 3)) {
      const ps = computePlaystyle(this.profile.matches, role, now, engine.playstyle, this.metaIndex?.snapshot.references[role]);
      if (!ps) continue;
      views.push({
        role,
        games: ps.games,
        axes: ps.axes.map((a) => {
          const m = a.metrics[0];
          const lv = level(a.score);
          return {
            axis: a.axis,
            label: explain.axes[a.axis] ?? a.axis,
            score: Math.round(a.score * 100),
            level: lv,
            levelLabel: renderReason({ id: `playstyle.level.${lv}`, slots: {} }, explain.templates, String),
            detail: m
              ? renderReason(
                  {
                    id: "playstyle.metric",
                    slots: { metric: metricLabel(m.metric, explain), you: formatMetric(m.you, m.metric, explain), reference: formatMetric(m.reference, m.metric, explain) },
                  },
                  explain.templates,
                  String,
                )
              : null,
            games: a.games,
          };
        }),
      });
    }
    this.update({ playstyle: views });
  }

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

  private updateRoleAdvice(): void {
    if (!this.profile) return;
    const lookup = this.championLookup;
    const newChamps: NewChampRoleView[] = [];
    const roles = adviseRoles(
      this.profile.games,
      this.profile.masteries,
      Date.now(),
      this.config.engine,
      this.intendedPositions,
      this.attrs,
    ).map((r) => {
      const { explain } = this.config;
      const say = (id: string, slots: Record<string, string | number> = {}) => renderReason({ id, slots }, explain.templates, String);
      const pool = r.enoughData
        ? analyzePool({
            role: r.role,
            comfort: this.comfortFor(r.role),
            masteries: this.profile!.masteries,
            matches: this.profile!.matches,
            attributes: this.attrs,
            intendedPositions: this.intendedPositions,
            now: Date.now(),
            config: this.config.engine,
          })
        : null;
      if (pool && this.metaIndex) {
        const played = new Map<ChampionId, number>();
        for (const g of this.profile!.games) if (g.position === r.role) played.set(g.championId, (played.get(g.championId) ?? 0) + 1);
        const advice = recommendNewChampions({
          role: r.role,
          pool,
          playedInRole: played,
          masteries: this.profile!.masteries,
          index: this.metaIndex,
          champions: (id) => lookup(id),
          attributes: this.attrs,
          owned: this.owned,
          config: this.config.engine.newChamps,
          coverage: this.config.engine.pool.coverage,
        });
        newChamps.push(
          newChampsView(advice, {
            explain,
            champion: (id) => champView(id, lookup),
            championName: (id) => lookup(id)?.name ?? `#${id}`,
            itemName: (id) => this.itemName(id),
            planGames: this.config.engine.newChamps.planGames,
            blockGames: this.config.engine.newChamps.learn.blockGames,
            plan: (id) =>
              learningPlan({
                championId: id,
                role: r.role,
                matches: this.profile!.matches,
                index: this.metaIndex,
                champion: lookup(id),
                goal: this.growth?.focus ? { role: this.growth.role, ...this.growth.focus } : null,
                completed: this.completedItemSet(),
                config: this.config.engine,
              }),
          }),
        );
      }
      return {
        role: r.role,
        games: r.games,
        winRate: r.winRate,
        score: r.score,
        enoughData: r.enoughData,
        pool: (pool?.champions ?? []).map((c) => ({
          champion: champView(c.championId, lookup)!,
          tier: c.tier,
          tierLabel: say(`pool.tier.${c.tier}`),
          games: c.games,
          winRate: c.winRate,
        })),
        holes: (pool?.holes ?? []).map((h) => ({
          text: say(`pool.hole.${h.need}`),
          evidence: h.losses > 0 ? say("pool.hole.evidence", { lacking: h.lossesLacking, losses: h.losses, role: r.role }) : null,
          coveredBy: h.coveredBy.length
            ? say("pool.hole.coveredBy", {
                champions: h.coveredBy
                  .map((id) => {
                    const c = pool!.champions.find((x) => x.championId === id)!;
                    return `${champView(id, lookup)!.name} (${say(`pool.tier.${c.tier}`).toLowerCase()})`;
                  })
                  .join(" and "),
              })
            : null,
        })),
      };
    });
    this.update({ roles, newChamps });
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
    const session = await connector.getGameflowSession().catch(() => null);
    const queueId = session?.gameData?.queue?.id;
    this.queueId = queueId ?? null;
    this.queueSupported = this.draft?.isCustomGame === true || queueId === undefined || config.app.supportedQueues.includes(queueId);
    if (!this.queueSupported) this.notice("This queue isn't supported yet — suggestions are for Ranked and Normal Draft.");
    this.onDraft();
  }

  private hadDraft = false;

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
    if (!this.draft || !profile || !this.queueSupported) {
      this.shownLoadout = null;
      // Out of champ select: keep showing your pick and its loadout (import only works in champ select).
      const kept = this.draft ? null : this.keptPick && { ...this.keptPick, importMessage: null, loadout: this.keptPick.loadout && { ...this.keptPick.loadout, canImport: false } };
      this.update({ picks: [], bans: [], hoverBans: null, hoverPick: null, myPick: kept, pickAdvice: { whyNot: null, confidence: null }, pickRole: this.profile ? mainRole(this.profile.games) : null, laneOpponent: null, enemyNotes: [] });
      return;
    }
    const { engine } = this.config;
    const role = draftRole(this.draft, profile.games);
    const comfort = loading ? new Map<ChampionId, ComfortStats>() : this.comfortFor(role);
    const input = {
      draft: this.draft,
      pickable: this.pickable,
      unavailable: unavailableChampions(this.draft),
      comfort,
      attributes: this.attributes,
      intendedPositions: this.intendedPositions,
      role,
      weights: weightsForBand(this.band, engine),
      config: engine,
    };
    // Live meta (engine v2) when the band's snapshot is loaded; the player's own data otherwise.
    const live = this.metaIndex ? { ...input, index: this.metaIndex, band: this.band } : null;
    const lookup = this.championLookup;
    const { templates } = this.config.explain;
    const nameOf = (id: number) => lookup(id)?.name ?? `#${id}`;
    const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, templates, nameOf, { item: (id) => this.itemName(id) });

    // Their team in short (damage type, main engage), once two are picked.
    const enemyNotes = live ? enemyTeamNotes(live).map(say) : [];

    // Locked in: no more suggestions; show the player's own pick (and, with live meta, how it looks in this draft).
    const locked = lockedPick(this.draft);
    // The one draft fact the advice hinges on: who you face in lane (the client doesn't say enemy roles).
    const lane = role ? { role, champion: champView(laneOpponent(this.draft, role, this.metaIndex) ?? 0, lookup) } : null;
    /** The card for a champion: how it looks in this draft and its loadout (the import buttons use it). */
    const card = (championId: number, hovering: boolean): MyPickView => {
      const assessed = live ? assessPick(live, championId) : null;
      // Your own games on the champion fill in when your rank has too few (completed items from Data Dragon).
      let completed: Set<number> = new Set();
      let boots: Set<number> = new Set();
      let data = null;
      try {
        data = this.deps.ddragon.data;
        completed = completedItems(data.itemInfo, engine.loadout.items);
        boots = completedBoots(data.itemInfo, engine.loadout.items);
      } catch {
        // Data Dragon not loaded yet: names fall back to ids.
      }
      const personal = personalBuild(profile.matches, championId, role, completed);
      const buildsFrom = (id: number) => this.deps.ddragon.data.itemInfo.get(id)?.from ?? [];
      const loadout = live ? draftLoadout(live, championId, engine.loadout, personal, boots, buildsFrom) : null;
      if (this.shownLoadout?.loadout.championId !== championId) this.importMessage = null;
      this.shownLoadout = loadout ? { loadout, champion: nameOf(championId) } : null;
      return {
        champion: champView(championId, lookup)!,
        role,
        expectedWin: assessed?.expectedWin ?? null,
        reasons: assessed ? assessed.reasons.map((r) => reasonView(r, say)) : [],
        loadout: loadout
          ? toLoadoutView(loadout, {
              data,
              templates,
              championName: nameOf,
              bands: this.config.bands,
              band: this.band,
              canImport: this.canImport,
              perk: (id) => this.perks.get(id),
              shardRows: this.shardRows,
              spikeSlots: live && role ? powerSpikes(live.index, championId, role, engine.spikes).filter((s) => s.kind === "item").map((s) => s.at) : [],
            })
          : null,
        importMessage: this.importMessage,
        hovering,
        matchups: this.metaIndex && this.draft ? draftMatchups(this.draft, this.metaIndex, championId, role, lookup) : null,
        plan: [...(live ? gamePlan(live, championId) : []), ...this.recordVsLane(profile, championId, role)].map(say),
      };
    };

    if (locked !== null) {
      const assessed = live ? assessPick(live, locked) : null;
      this.recorder.locked(adviceOption(assessed ?? { championId: locked }), { role, band: this.band, queueId: this.queueId, now: Date.now() });
      this.update({ picks: [], bans: [], hoverBans: null, hoverPick: null, pickAdvice: { whyNot: null, confidence: null }, pickRole: role, laneOpponent: lane, enemyNotes, myPick: card(locked, false) });
      this.keptPick = this.view.myPick;
      return;
    }
    const advice: PickAdvice = live ? adviseLivePicks(live) : advisePicks(input, this.config.explain.settings);
    this.recorder.shown(advice.picks.map(adviceOption));
    const views: PickView[] = advice.picks.map((p) => ({
      champion: champView(p.championId, lookup)!,
      score: p.score,
      expectedWin: p.expectedWin ?? null,
      factors: p.factors,
      terms: p.terms ?? [],
      reasons: p.reasons.map((r) => reasonView(r, say)),
      offMeta: p.offMeta,
    }));
    const pickAdvice = {
      whyNot: advice.whyNot ? say(advice.whyNot) : null,
      confidence: advice.confidence ? { level: advice.confidence, label: say({ id: `confidence.${advice.confidence}`, slots: {} }) } : null,
      minGames: this.config.engine.rating.minGames,
    };
    const banning = live !== null && banningNow(this.draft);
    const banSuggestions = banning ? suggestBans(live) : [];
    // The ban table shows the rates in columns: its reason lines use the short ".row" wording when there is one.
    const row = (r: BanSuggestion["reasons"][number]) => say(templates[`${r.id}.row`] ? { ...r, id: `${r.id}.row` } : r);
    const toView = (b: BanSuggestion): BanView => ({ champion: champView(b.championId, lookup)!, reasons: b.reasons.map(row), ...banNumbers(live!.index, b, role, engine.rating.bans.minPickRate) });
    // Hovering a champion before or during bans: extra bans that protect it (1 if it's already the top suggestion).
    const hovered = this.draft.myTeam.find((s) => s.isLocalPlayer)?.pickIntentId ?? 0;
    const hoverBans =
      banning && hovered > 0
        ? {
            champion: champView(hovered, lookup)!,
            bans: suggestHoverBans(live, hovered, banSuggestions.map((b) => b.championId)).map(toView),
          }
        : null;
    // Hovering (or selected, not locked yet): its loadout already, so there's time to read and import it.
    const me = this.draft.myTeam.find((s) => s.isLocalPlayer);
    const pending = me ? me.championId || me.pickIntentId : 0;
    const hoverCard = live && pending > 0 ? card(pending, true) : null;
    if (!hoverCard?.loadout) this.shownLoadout = null;
    if (loading) return this.update({ picks: [], pickAdvice: { whyNot: null, confidence: null }, bans: banSuggestions.map(toView), hoverBans, myPick: null, hoverPick: null, pickRole: role, laneOpponent: lane, enemyNotes });
    this.update({ picks: views, pickAdvice, bans: banSuggestions.map(toView), hoverBans, myPick: null, hoverPick: hoverCard?.loadout ? hoverCard : null, pickRole: role, laneOpponent: lane, enemyNotes });
  }
}
