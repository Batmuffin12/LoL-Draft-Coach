import { renderReason, type Loadout } from "@ldc/engine";
import { LcuImporter, type LcuConnector } from "@ldc/lcu";
import type { ChampionId } from "@ldc/shared";
import type { ImportLine, MyPickView } from "../shared/view";
import type { LoadedConfig } from "./config";
import { importShownLoadout } from "./loadout-import";
import { cardLoadout, pickCardView, type PickCardContext } from "./pick-card";
import { logProblem } from "./problem-log";

export interface ImportFlowDeps {
  config: () => LoadedConfig;
  /** The connected client's credentials, or null. */
  connector: Pick<LcuConnector, "credentials">;
  /** Champ select is on. */
  hasDraft: () => boolean;
  notice: (key: string, text: string) => void;
  clearNotice: (key: string) => void;
  /** Show the import's outcome on the card. */
  redraw: () => void;
}

/**
 * The import button: remembers the loadout on the Your pick card and what the last click came to.
 * Writes only from the player's click (CLAUDE.md: the single approved LCU write exception).
 */
export class ImportFlow {
  /** The loadout shown in the Your pick card, for the import buttons. */
  private shown: { loadout: Loadout; champion: string } | null = null;
  private lines: ImportLine[] = [];

  constructor(private readonly deps: ImportFlowDeps) {}

  /**
   * Writes the shown loadout into the League client: "runes" = the rune page and your two
   * summoner spells, "items" = the item set, "all" = both, one after the other (the panel's one
   * import button). `pageKey`: the rune option on screen. Every click ends in a message: on the
   * card, or as a notice when the card has gone in the meantime.
   */
  async run(kind: "runes" | "items" | "all", pageKey?: string): Promise<void> {
    const { deps, shown } = this;
    const creds = deps.connector.credentials;
    deps.clearNotice("import");
    if (!deps.config().app.import.enabled) return deps.notice("import", this.say("import.off"));
    if (!shown) return deps.notice("import", this.say(deps.hasDraft() ? "import.nothing" : "import.onlyChampSelect"));
    if (!creds) this.lines = [{ text: this.say("import.noClient"), failed: true }];
    else {
      try {
        this.lines = await importShownLoadout(kind, shown, new LcuImporter(creds), deps.config(), pageKey);
      } catch (err) {
        logProblem(`Import: ${(err as Error).message}`);
        this.lines = [{ text: this.say("import.failed.other"), failed: true }];
      }
    }
    deps.redraw();
  }

  /** The card for a champion, keeping its loadout for the import button (a message from an earlier import goes with another champion). */
  card(championId: ChampionId, hovering: boolean, ctx: PickCardContext): MyPickView {
    const loadout = cardLoadout(championId, ctx);
    if (this.shown?.loadout.championId !== championId) this.lines = [];
    const nameOf = (id: number) => ctx.lookup(id)?.name ?? `#${id}`;
    this.shown = loadout ? { loadout, champion: nameOf(championId) } : null;
    return pickCardView(championId, hovering, loadout, this.lines, ctx);
  }

  /** No card on screen any more: nothing to import. */
  forget(): void {
    this.shown = null;
  }

  /** What a card kept through the game says: import works only in champ select. */
  keptHint(): ImportLine[] {
    const text = this.deps.config().app.import.enabled ? this.say("import.onlyChampSelect") : null;
    return text ? [{ text, failed: false }] : [];
  }

  private say(id: string): string {
    return renderReason({ id, slots: {} }, this.deps.config().explain.templates, String);
  }
}
