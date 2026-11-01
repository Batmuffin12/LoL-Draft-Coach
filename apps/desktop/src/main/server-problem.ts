import { logProblem } from "./problem-log";
import { ServerError } from "./server-client";

/** Waits before trying the server again after a failure: 1, 2, 5, then every 10 minutes. */
export const SERVER_RETRY_DELAYS_MS = [60_000, 120_000, 300_000, 600_000];

/** The wait before retry number `failures` (1 = after the first failure). */
export function retryDelay(failures: number, delays: readonly number[] = SERVER_RETRY_DELAYS_MS): number {
  return delays[Math.min(failures, delays.length) - 1]!;
}

/**
 * What the panel says when the server failed, one wording per kind of failure. Never the raw
 * error: addresses, HTTP details and validation dumps go to the local log (logUnexpected).
 * What the server itself says to players (a refused invite code) stays as it is. Pure.
 */
export function serverProblemText(err: unknown): string {
  if (!(err instanceof ServerError)) return "Something went wrong talking to the coach server.";
  switch (err.code) {
    case "asleep":
      return "The coach server is still starting up.";
    case "timeout":
      return "The coach server didn't answer in time.";
    case "unreachable":
      return "Can't reach the coach server: check your internet connection.";
    case "server_error":
      return `The coach server had a problem (HTTP ${err.status}).`;
    case "bad_response":
      return "The coach server sent something this app doesn't understand: an app update may be needed.";
    default:
      return err.message;
  }
}

/** serverProblemText, and that it tries again but not when: the message stays on screen, so a time in it would go stale. Pure. */
export function serverProblem(err: unknown): string {
  return `${serverProblemText(err)} Trying again automatically.`;
}

/** Logs the technical detail of a failure that isn't everyday (not offline, asleep or refused) locally. */
export function logUnexpected(where: string, err: unknown): void {
  const everyday = err instanceof ServerError && err.code !== "server_error" && err.code !== "bad_response";
  if (!everyday) logProblem(`${where}: ${(err as Error).message}`);
}
