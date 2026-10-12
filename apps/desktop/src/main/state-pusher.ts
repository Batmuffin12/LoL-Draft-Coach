/**
 * Sends the panel's ViewState to the renderer at most once per event-loop turn, and never the same
 * state twice in a row. One event often updates the state several times in a row (a new profile
 * updates the focus, the pool, the style, the last game and the draft, one after another); the
 * renderer only ever needs the last of them, and the screen it draws is the same.
 */
export class StatePusher<T> {
  private pending: T | null = null;
  private scheduled = false;
  private lastSent: string | null = null;

  constructor(
    private readonly send: (state: T) => void,
    private readonly schedule: (fn: () => void) => void = (fn) => setImmediate(fn),
  ) {}

  /** A new state: sent on the next turn of the event loop, with any later state of this turn instead. */
  push(state: T): void {
    this.pending = state;
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => this.flush());
  }

  /** Sends the pending state now, unless it is the same as the last one sent. */
  flush(): void {
    this.scheduled = false;
    const state = this.pending;
    this.pending = null;
    if (state === null) return;
    const json = JSON.stringify(state);
    if (json === this.lastSent) return;
    this.lastSent = json;
    this.send(state);
  }

  /** The renderer (re)loaded and has nothing: send this state even if it was sent before. */
  resend(state: T): void {
    this.pending = null;
    this.lastSent = JSON.stringify(state);
    this.send(state);
  }
}
