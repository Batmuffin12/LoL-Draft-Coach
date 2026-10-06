import { communityDragonAsset } from "@ldc/ddragon";
import { LcuImporter, LcuWriteError, unavailableChampions } from "@ldc/lcu";
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
import type { BanSuggestion, ChampionId, DraftState, MetaSnapshot, PickAdvice, Position, RankBandId } from "@ldc/shared";
import type { BanView, MyPickView, PickView, PlaystyleView } from "../shared/view";
import type { MetaSource } from "./meta-source";
import { Coach, type CoachDeps } from "./coach";
import type { LoadedConfig } from "./config";
import { champView } from "./draft-view";
import { toLoadoutView } from "./loadout-view";
import { reasonView } from "./reason-view";
import { banNumbers, draftMatchups } from "./stats-view";
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
  /** Live meta snapshots (server mode); null: score from the player's own data only (engine v1). */
  meta?: MetaSource | null;
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
      const l = shown.loadout;
      if (kind === "runes") {
        // The rune page and the spells are separate client calls: one failing doesn't stop the other.
        const done: string[] = [];
        const failed = (err: unknown) =>
          done.push(err instanceof LcuWriteError && err.reason === "pagesFull" ? say("import.runes.full") : say("import.failed", { error: (err as Error).message }));
        if (l.page) {
          const p = l.page.value;
          // Stored shards are in Riot's match order (defense, flex, offense); the client wants offense, flex, defense.
          await importer
            .importRunePage({ name: shown.champion, primaryStyleId: p.primaryStyle, subStyleId: p.subStyle, selectedPerkIds: [...p.runes, ...[...p.statPerks].reverse()] })
            .then((result) => done.push(say(`import.runes.${result}`)), failed);
        }
        const s = l.spells?.value;
        if (s?.length === 2) await importer.importSpells([s[0]!, s[1]!]).then(() => done.push(say("import.spells.done")), failed);
        this.importMessage = done.join(" · ");
      } else {
        // A full build: start, boots, the core (items 1-3) and later items (4+), what to buy
        // against this enemy team (one block per need), and the other options players take.
        const path = l.core?.value ?? [];
        const onPath = new Set([...path, ...(l.boots ? [l.boots.top.itemId] : [])]);
        const others = [...new Set([...l.items.flatMap((s) => s.alternatives.map((a) => a.itemId)), ...(l.boots?.alternatives.map((a) => a.itemId) ?? [])])].filter((id) => !onPath.has(id));
        const byTrait = new Map<string, number[]>();
        for (const s of l.situational) byTrait.set(s.trait, [...(byTrait.get(s.trait) ?? []), s.itemId]);
        const blocks = [
          { type: say("import.block.starting"), items: l.starting?.value ?? [] },
          { type: say("import.block.boots"), items: l.boots ? [l.boots.top.itemId] : [] },
          { type: say("import.block.core"), items: path.slice(0, 3) },
          l.laterPool.length
            ? { type: say("import.block.laterPool"), items: l.laterPool.map((x) => x.itemId) }
            : { type: say("import.block.later"), items: path.slice(3) },
          ...[...byTrait].map(([trait, items]) => ({ type: say(`import.block.situational.${trait}`), items })),
          { type: say("import.block.alternatives"), items: others },
        ].filter((b) => b.items.length > 0);
        await importer.importItemSet({ title: `${shown.champion} ${l.role}`, championId: l.championId, mapId: Number(this.config.engine.loadout.items.mapId), blocks });
        this.importMessage = say("import.items.done");
      }
    } catch (err) {
      this.importMessage = err instanceof LcuWriteError && err.reason === "pagesFull" ? say("import.runes.full") : say("import.failed", { error: (err as Error).message });
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
  }

  /** Applies a new scoring config (from the server) and recomputes everything shown. */
  setConfig(config: LoadedConfig): void {
    // Wording the server doesn't have yet (an older server) falls back to the bundled copy, never to raw ids.
    this.config = { ...config, explain: { ...config.explain, templates: { ...this.p.config.explain.templates, ...config.explain.templates } } };
    this.comfortByRole.clear();
    if (this.profile) this.attributes = deriveChampionAttributes(this.profile.samples, config.engine.teamNeeds.minAttributeSamples);
    if (this.metaIndex) this.metaIndex = new MetaIndex(this.metaIndex.snapshot, config.engine.rating);
    this.updateRoleAdvice();
    this.updatePlaystyle();
    this.onDraft();
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
    const { meta } = this.p;
    if (meta) {
      meta.on("snapshot", (s) => this.setSnapshot(s));
      meta.on("status", (st) => this.update({ meta: st.state === "none" ? null : st }));
      if (meta.snapshot) this.setSnapshot(meta.snapshot);
      profiles?.on("account", (a) => {
        if (a.state === "registered") this.refreshMeta(true);
      });
    }
    this.p.ddragon.on("patch", () => this.updateRoleAdvice()); // champion names/icons for the lobby
    this.p.connector.on("status", (s) => {
      if (s === "connected") void this.onClientConnected();
    });
    this.p.connector.on("gameflowPhase", (phase) => {
      // New games are in the player's history once a game has ended.
      if (phase === "EndOfGame") void this.p.profiles?.refresh();
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
    this.updateRoleAdvice();
    this.updatePlaystyle();
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
    this.updateRoleAdvice();
    this.updatePlaystyle();
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
    this.update({ roles });
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
    this.queueSupported = this.draft?.isCustomGame === true || queueId === undefined || config.app.supportedQueues.includes(queueId);
    if (!this.queueSupported) this.notice("This queue isn't supported yet — suggestions are for Ranked and Normal Draft.");
    this.onDraft();
  }

  private hadDraft = false;

  protected override onDraft(): void {
    super.onDraft();
    if (this.draft && !this.hadDraft) {
      this.keptPick = null; // a new champ select: the last game's pick no longer applies
      void this.onChampSelectStart();
    }
    this.hadDraft = this.draft !== null;
    if (!this.draft || !this.profile || !this.queueSupported) {
      this.shownLoadout = null;
      // Out of champ select: keep showing your pick and its loadout (import only works in champ select).
      const kept = this.draft ? null : this.keptPick && { ...this.keptPick, importMessage: null, loadout: this.keptPick.loadout && { ...this.keptPick.loadout, canImport: false } };
      this.update({ picks: [], bans: [], hoverBans: null, hoverPick: null, myPick: kept, pickAdvice: { whyNot: null, confidence: null }, pickRole: this.profile ? mainRole(this.profile.games) : null, laneOpponent: null });
      return;
    }
    const { engine } = this.config;
    const role = draftRole(this.draft, this.profile.games);
    const comfort = this.comfortFor(role);
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
    const lookup = (id: number) => {
      try {
        return this.deps.ddragon.champion(id);
      } catch {
        return undefined;
      }
    };
    const { templates } = this.config.explain;
    const nameOf = (id: number) => lookup(id)?.name ?? `#${id}`;
    const say = (r: Parameters<typeof renderReason>[0]) => renderReason(r, templates, nameOf);

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
      const personal = personalBuild(this.profile!.matches, championId, role, completed);
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
            })
          : null,
        importMessage: this.importMessage,
        hovering,
        matchups: this.metaIndex && this.draft ? draftMatchups(this.draft, this.metaIndex, championId, role, lookup) : null,
      };
    };

    if (locked !== null) {
      this.update({ picks: [], bans: [], hoverBans: null, hoverPick: null, pickAdvice: { whyNot: null, confidence: null }, pickRole: role, laneOpponent: lane, myPick: card(locked, false) });
      this.keptPick = this.view.myPick;
      return;
    }
    const advice: PickAdvice = live ? adviseLivePicks(live) : advisePicks(input, this.config.explain.settings);
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
    const toView = (b: BanSuggestion): BanView => ({ champion: champView(b.championId, lookup)!, reasons: b.reasons.map(say), ...banNumbers(live!.index, b, role, engine.rating.bans.minPickRate) });
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
    this.update({ picks: views, pickAdvice, bans: banSuggestions.map(toView), hoverBans, myPick: null, hoverPick: hoverCard?.loadout ? hoverCard : null, pickRole: role, laneOpponent: lane });
  }
}
