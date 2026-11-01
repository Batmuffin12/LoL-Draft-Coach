import { EventEmitter } from "node:events";
import type { DataDragon } from "@ldc/ddragon";
import { sanitizeChampSelect, type LcuConnector } from "@ldc/lcu";
import type { DraftState } from "@ldc/shared";
import { emptyViewState, type ViewState } from "../shared/view";
import { logProblem } from "./problem-log";
import { PhaseLength, toDraftView } from "./draft-view";

export interface CoachDeps {
  connector: LcuConnector;
  ddragon: DataDragon;
  now?: () => number;
}

/**
 * Glues the adapters together and produces the panel's ViewState.
 * No Electron imports, so it runs under tests with the mock LCU.
 */
export class Coach extends EventEmitter<{ state: [ViewState] }> {
  protected view: ViewState = emptyViewState();
  protected draft: DraftState | null = null;
  private readonly now: () => number;
  private readonly phase = new PhaseLength();
  /** Notices you closed: they stay away until their cause ends. */
  private readonly dismissed = new Set<string>();
  private championDataMissing = false;

  constructor(protected readonly deps: CoachDeps) {
    super();
    this.now = deps.now ?? Date.now;
  }

  get state(): ViewState {
    return this.view;
  }

  async start(): Promise<void> {
    const { connector, ddragon } = this.deps;
    connector.on("status", (lcu) => {
      this.update({ status: { ...this.view.status, lcu } });
      if (lcu !== "connected") this.clearNotice("schema");
    });
    connector.on("gameflowPhase", (phase) => {
      this.update({ status: { ...this.view.status, gameflowPhase: phase } });
      if (phase === "ChampSelect" && this.championDataMissing) void this.loadChampionData();
    });
    connector.on("champSelect", (session) => {
      this.clearNotice("schema");
      this.draft = session ? sanitizeChampSelect(session) : null;
      this.onDraft();
    });
    connector.on("schemaError", (err) => {
      if (this.notice("schema", this.wording("notice.schema"))) logProblem(`League client data: ${err.message}`);
    });
    ddragon.on("patch", (d) => {
      this.update({ status: { ...this.view.status, patch: d.version } });
      this.onDraft();
    });

    await this.loadChampionData();
    connector.start();
  }

  /** Champion names and icons; a failure is tried again at the next champ select. */
  private async loadChampionData(): Promise<void> {
    try {
      await this.deps.ddragon.load();
      this.championDataMissing = false;
      this.clearNotice("championData");
    } catch (err) {
      this.championDataMissing = true;
      if (this.notice("championData", this.wording("notice.championData"))) logProblem(`Champion data: ${(err as Error).message}`);
    }
  }

  stop(): void {
    this.deps.connector.stop();
  }

  setDocked(docked: boolean): void {
    this.update({ docked });
  }

  /** What first use has shown so far changed (the tour, a hint). */
  setUi(ui: ViewState["ui"]): void {
    this.update({ ui });
  }

  /** Re-renders the draft; subclasses add recommendations. */
  protected onDraft(): void {
    const lookup = (id: number) => {
      try {
        return this.deps.ddragon.champion(id);
      } catch {
        return undefined;
      }
    };
    if (!this.draft) this.phase.reset();
    this.update({ draft: this.draft ? toDraftView(this.draft, lookup, this.now(), this.phase.observe(this.draft)) : null });
  }

  /** The app's own version, shown in the footer. */
  setAppVersion(version: string): void {
    this.update({ app: { ...this.view.app, version } });
  }

  /** A newer version is downloaded: the lobby's footer says so and offers the restart. Never a notice, which would show in champ select. */
  updateReady(version: string): void {
    this.update({ app: { ...this.view.app, updateReady: version } });
  }

  /** Fixed wording from the explain config (ui.* templates, without the prefix). */
  protected wording(id: string): string {
    return this.view.copy[id] ?? id;
  }

  /** Shows a notice for this cause, once. True when it newly appeared (not already shown, not dismissed). */
  protected notice(key: string, text: string): boolean {
    if (this.dismissed.has(key)) return false;
    const shown = this.view.notices.find((n) => n.key === key);
    if (shown?.text === text) return false;
    this.update({ notices: [...this.view.notices.filter((n) => n.key !== key), { key, text }].slice(-3) });
    return !shown;
  }

  /** The cause ended: the notice goes, and it may show again if the cause comes back. */
  protected clearNotice(key: string): void {
    this.dismissed.delete(key);
    if (this.view.notices.some((n) => n.key === key)) this.update({ notices: this.view.notices.filter((n) => n.key !== key) });
  }

  /** You closed the notice: it stays away until its cause has ended. */
  dismissNotice(key: string): void {
    this.dismissed.add(key);
    if (this.view.notices.some((n) => n.key === key)) this.update({ notices: this.view.notices.filter((n) => n.key !== key) });
  }

  protected update(patch: Partial<ViewState>): void {
    this.view = { ...this.view, ...patch };
    this.emit("state", this.view);
  }
}
