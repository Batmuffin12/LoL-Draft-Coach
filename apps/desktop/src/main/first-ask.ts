import type { EventEmitter } from "node:events";

/** If the page never asks (it crashed, say), the coach starts anyway after this long. */
export const FIRST_ASK_WAIT_MS = 3_000;

/**
 * Resolves when the page first asks for the state, or after `waitMs`. The window's paint goes
 * through this process, so loading your games right then would hold up the first screen: the
 * coach starts its work once the page is there. Call it before the page can ask.
 */
export function firstAsk(ipc: Pick<EventEmitter, "once">, channel: string, waitMs = FIRST_ASK_WAIT_MS): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    ipc.once(channel, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
