import { reportProblem } from "./crash-reports";
import { ServerError } from "./server-client";

/** Waits before trying the server again after a failure: 1, 2, 5, then every 10 minutes. */
export const SERVER_RETRY_DELAYS_MS = [60_000, 120_000, 300_000, 600_000];

/** The wait before retry number `failures` (1 = after the first failure). */
export function retryDelay(failures: number, delays: readonly number[] = SERVER_RETRY_DELAYS_MS): number {
  return delays[Math.min(failures, delays.length) - 1]!;
}

const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/**
 * What the panel says when the server failed, one wording per kind of failure. Never the raw
 * error: addresses, HTTP details and validation dumps go to crash reports (reportUnexpected).
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

/** serverProblemText and when it tries again. Pure. */
export function serverProblem(err: unknown, retryInMs: number): string {
  return `${serverProblemText(err)} Trying again in ${minutes(retryInMs)}.`;
}

/** Sends the technical detail of a failure that isn't everyday (not offline, asleep or refused) to crash reports. */
export function reportUnexpected(where: string, err: unknown): void {
  const everyday = err instanceof ServerError && err.code !== "server_error" && err.code !== "bad_response";
  if (!everyday) reportProblem(`${where}: ${(err as Error).message}`);
}
