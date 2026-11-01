import { adviseLivePicks, advisePicks, assessPick, mainRole, type ChampionAttributes, type ComfortStats, type MetaIndex } from "@ldc/engine";
import type { LcuConnector } from "@ldc/lcu";
import type { ChampionId, DraftState, PickAdvice, Position, RankBandId } from "@ldc/shared";
import type { MyPickView, ViewState } from "../shared/view";
import { adviceOption, type AdviceRecorder } from "./advice-log";
import type { LoadedConfig } from "./config";
import { banningNow, draftScoring, lockedPick, queueSupported } from "./draft-facts";
import { bansNow, keptCard, loadingPanel, lockedPanel, noDraftPanel, pendingPick, suggestionPanel } from "./draft-panel";
import { currentGame } from "./game-wait";
import type { ImportFlow } from "./import-flow";
import { draftNotes, type PickCardContext } from "./pick-card";
import { profileFromMatches, type PersonalProfile } from "./profile";

/** Client phases where a game is starting or running: the locked-in loadout stays only then. */
const GAME_PHASES = new Set(["ChampSelect", "GameStart", "InProgress", "Reconnect"]);

export interface DraftSessionDeps {
  connector: LcuConnector;
  /** The config this build came with: which queues are coached doesn't wait for the server's. */
  bundled: LoadedConfig;
  draft: () => DraftState | null;
  imports: ImportFlow;
  recorder: AdviceRecorder;
  view: () => ViewState;
  update: (patch: Partial<ViewState>) => void;
  notice: (key: string, text: string) => void;
  clearNotice: (key: string) => void;
  wording: (id: string) => string;
  /** A champ select started: whatever failed earlier gets another try. */
  onStarted: () => void;
  redraw: () => void;
}

/** What a draft is scored from right now. */
export interface DraftInputs {
  profile: PersonalProfile | null;
  index: MetaIndex | null;
  config: LoadedConfig;
  band: RankBandId;
  attributes: Map<ChampionId, ChampionAttributes>;
  intendedPositions: Map<ChampionId, Position[]>;
  comfortFor: (role: Position | null) => Map<ChampionId, ComfortStats>;
  cardContext: (live: PickCardContext["live"], draft: DraftState, role: Position | null, profile: PersonalProfile) => PickCardContext;
}

/**
 * One champ select, from its first frame until the game it's for is over: which champions are
 * pickable, whether the queue is coached, and what the panel shows at each stage.
 */
export class DraftSession {
  private hadDraft = false;
  private pickable: ChampionId[] = [];
  private queueOk = true;
  /** The queue of the current champ select (from the gameflow session). */
  private queueId: number | null = null;
  /** The client's gameflow phase, as this coach last heard it ("" before the first). */
  private phase = "";
  /**
   * The last "Your pick" card, kept after champ select ends (champ select often closes
   * seconds after you lock in, e.g. in custom games) until the game is over.
   */
  private kept: MyPickView | null = null;

  constructor(private readonly deps: DraftSessionDeps) {}

  get clientPhase(): string {
    return this.phase;
  }

  phaseChanged(phase: string): void {
    if (phase === "InProgress") void this.onGameStarted();
    if (["Lobby", "None", "Matchmaking", "ReadyCheck"].includes(phase)) this.deps.recorder.leftChampSelect();
    this.phase = phase;
    // The kept loadout is for the game being played: drop it as soon as the client is anywhere else.
    if (!GAME_PHASES.has(phase)) this.kept = null;
  }

  /** The game started: its id ties the advice shown in champ select to the game in your history. */
  private async onGameStarted(): Promise<void> {
    const { gameId, queueId } = await currentGame(this.deps.connector);
    this.deps.recorder.gameStarted(gameId, queueId);
  }

  /** On a new champ select: read which champions are pickable and whether the queue is supported. */
  private async onStart(): Promise<void> {
    const { deps } = this;
    deps.onStarted();
    this.pickable = await deps.connector.getPickableChampionIds().catch(() => []);
    const { queueId } = await currentGame(deps.connector);
    this.queueId = queueId;
    const draft = deps.draft();
    this.queueOk = queueSupported(draft, queueId, deps.bundled.app.supportedQueues);
    if (this.queueOk || !draft) deps.clearNotice("queue");
    else deps.notice("queue", deps.wording("notice.queue"));
    deps.redraw();
  }

  /** Puts the current draft on the panel. */
  render(i: DraftInputs): void {
    const { deps } = this;
    const draft = deps.draft();
    if (draft && !this.hadDraft) {
      this.kept = null; // a new champ select: the last game's pick no longer applies
      deps.clearNotice("import");
      deps.recorder.newChampSelect();
      void this.onStart();
    }
    if (!draft && this.hadDraft) deps.clearNotice("queue");
    const unsupportedQueue = draft !== null && !this.queueOk;
    if (unsupportedQueue !== deps.view().unsupportedQueue) deps.update({ unsupportedQueue });
    this.hadDraft = draft !== null;
    // While your history loads, bans still come from the live meta alone (picks wait for your history).
    const loading = !i.profile && draft !== null && this.queueOk && i.index !== null && banningNow(draft);
    const profile = i.profile ?? (loading ? profileFromMatches([], []) : null);
    if (!draft || !profile || !this.queueOk) return this.showNoDraft(i);
    this.showDraft(draft, profile, loading, i);
  }

  private showDraft(draft: DraftState, profile: PersonalProfile, loading: boolean, i: DraftInputs): void {
    const { recorder, imports, update } = this.deps;
    const { role, input, filled, live } = draftScoring({
      draft,
      games: profile.games,
      loading,
      pickable: this.pickable,
      comfortFor: i.comfortFor,
      attributes: i.attributes,
      intendedPositions: i.intendedPositions,
      band: i.band,
      engine: i.config.engine,
      index: i.index,
    });
    const ctx = i.cardContext(live, draft, role, profile);
    const notes = draftNotes(draft, role, live, filled, ctx);
    const locked = lockedPick(draft);
    if (locked !== null) {
      const assessed = live ? assessPick(live, locked) : null;
      recorder.locked(adviceOption(assessed ?? { championId: locked }), { role, band: i.band, queueId: this.queueId, now: Date.now() });
      update(lockedPanel(role, notes, imports.card(locked, false, ctx)));
      this.kept = this.deps.view().myPick;
      return;
    }
    const advice: PickAdvice = live ? adviseLivePicks(live) : advisePicks(input, i.config.explain.settings);
    recorder.shown(advice.picks.map(adviceOption));
    const bans = bansNow(ctx);
    // Hovering (or selected, not locked yet): its loadout already, so there's time to read and import it.
    const pending = pendingPick(draft);
    const hoverCard = live && pending > 0 ? imports.card(pending, true, ctx) : null;
    if (!hoverCard?.loadout) imports.forget();
    update(loading ? loadingPanel(role, notes, bans) : suggestionPanel(advice, role, notes, bans, hoverCard, ctx));
  }

  /** Out of champ select (or no history, or a queue we don't coach): your pick stays while the game it's for is on. */
  private showNoDraft(i: DraftInputs): void {
    const { deps } = this;
    deps.imports.forget();
    const kept = deps.draft() || !GAME_PHASES.has(this.phase) ? null : keptCard(this.kept, deps.imports.keptHint());
    deps.update(noDraftPanel(kept, i.profile ? mainRole(i.profile.games) : null));
  }
}
