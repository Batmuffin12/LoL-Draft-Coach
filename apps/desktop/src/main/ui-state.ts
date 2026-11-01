import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { emptyUiState, type UiState } from "../shared/ui-state";

/** Each field falls back alone: a broken one doesn't lose the other. */
const UiStateSchema = z.object({
  tourDone: z.boolean().catch(false),
  hintsSeen: z.array(z.string()).catch([]),
});

/**
 * The tour and hints already shown, in one small file in the app's user data folder. A missing or
 * corrupt file means nothing was shown yet, and a failed write costs at most a repeat: neither
 * is ever worth an error on screen.
 */
export class UiStateStore {
  private state = emptyUiState();
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<UiState> {
    try {
      this.state = UiStateSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
    } catch {
      this.state = emptyUiState();
    }
    return this.state;
  }

  /** The tour was finished or skipped. Returns the new state; the file follows. */
  finishTour(): UiState {
    return this.state.tourDone ? this.state : this.set({ ...this.state, tourDone: true });
  }

  /** The hint was shown. Returns the new state; the file follows. */
  sawHint(id: string): UiState {
    return this.state.hintsSeen.includes(id) ? this.state : this.set({ ...this.state, hintsSeen: [...this.state.hintsSeen, id] });
  }

  /** Resolves once everything asked for so far is on disk (or has failed). */
  flushed(): Promise<void> {
    return this.writes;
  }

  private set(next: UiState): UiState {
    this.state = next;
    // One at a time, whole or not at all: a crash mid-write can't leave half a file.
    const text = JSON.stringify(next);
    this.writes = this.writes.then(async () => {
      try {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(`${this.file}.tmp`, text, "utf8");
        await rename(`${this.file}.tmp`, this.file);
      } catch (err) {
        console.warn(`Couldn't save ${this.file}: ${(err as Error).message}`);
      }
    });
    return next;
  }
}
