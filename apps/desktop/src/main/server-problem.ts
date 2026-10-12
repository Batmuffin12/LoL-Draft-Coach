import { ServerError } from "./server-client";

/** Waits before trying the server again after a failure: 1, 2, 5, then every 10 minutes. */
export const SERVER_RETRY_DELAYS_MS = [60_000, 120_000, 300_000, 600_000];

/** The wait before retry number `failures` (1 = after the first failure). */
export function retryDelay(failures: number, delays: readonly number[] = SERVER_RETRY_DELAYS_MS): number {
  return delays[Math.min(failures, delays.length) - 1]!;
}

const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/**
 * What the panel says when the server failed, one wording per kind of failure, and when it
 * tries again. Pure.
 */
export function serverProblem(err: unknown, retryInMs: number): string {
  const again = `Trying again in ${minutes(retryInMs)}.`;
  if (!(err instanceof ServerError)) return `${(err as Error).message} ${again}`;
  switch (err.code) {
    case "asleep":
      return `The coach server is still starting up. ${again}`;
    case "timeout":
      return `The coach server didn't answer in time. ${again}`;
    case "unreachable":
      return `Can't reach the coach server: check your internet connection. ${again}`;
    case "server_error":
      return `The coach server had a problem (HTTP ${err.status}). ${again}`;
    case "bad_response":
      return `The coach server sent something this app doesn't understand: an app update may be needed. ${again}`;
    default:
      return `${err.message} ${again}`;
  }
}
