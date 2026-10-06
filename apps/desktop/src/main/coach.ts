import { EventEmitter } from "node:events";
import type { DataDragon } from "@ldc/ddragon";
import { sanitizeChampSelect, type LcuConnector } from "@ldc/lcu";
import type { DraftState } from "@ldc/shared";
import { emptyViewState, type ViewState } from "../shared/view";
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

  constructor(protected readonly deps: CoachDeps) {
    super();
    this.now = deps.now ?? Date.now;
  }

  get state(): ViewState {
    return this.view;
  }

  async start(): Promise<void> {
    const { connector, ddragon } = this.deps;
    connector.on("status", (lcu) => this.update({ status: { ...this.view.status, lcu } }));
    connector.on("gameflowPhase", (phase) => this.update({ status: { ...this.view.status, gameflowPhase: phase } }));
    connector.on("champSelect", (session) => {
      this.draft = session ? sanitizeChampSelect(session) : null;
      this.onDraft();
    });
    connector.on("schemaError", (err) => this.notice(err.message));
    ddragon.on("patch", (d) => {
      this.update({ status: { ...this.view.status, patch: d.version } });
      this.onDraft();
    });

    try {
      await ddragon.load();
    } catch (err) {
      this.notice(`Could not load champion data: ${(err as Error).message}`);
    }
    connector.start();
  }

  stop(): void {
    this.deps.connector.stop();
  }

  setDocked(docked: boolean): void {
    this.update({ docked });
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

  /** Shows a short message in the panel (e.g. an update is ready). */
  announce(message: string): void {
    this.notice(message);
  }

  protected notice(message: string): void {
    if (this.view.notices.includes(message)) return;
    this.update({ notices: [...this.view.notices, message].slice(-3) });
  }

  protected update(patch: Partial<ViewState>): void {
    this.view = { ...this.view, ...patch };
    this.emit("state", this.view);
  }
}
