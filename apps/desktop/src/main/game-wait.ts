import type { LcuConnector } from "@ldc/lcu";
import type { AdviceRecord, UserMatch } from "@ldc/shared";

/** Your history has the game with this client game id (Match-V5 ids end with it). */
export function hasGame(matches: UserMatch[] | undefined, gameId: number): boolean {
  return matches?.some((m) => m.match.matchId.endsWith(`_${gameId}`)) ?? false;
}

/** The client's own last game in a queue the history keeps, or null. */
export async function lastClientGame(connector: LcuConnector, queues: number[]): Promise<{ gameId: number; endedAt: number } | null> {
  const games = await connector.getRecentGames(1).catch(() => []);
  const g = games[0];
  return g && queues.includes(g.queueId) ? g : null;
}

/** A game that ended while the panel was closed (or before Riot published it): the client has it, your history doesn't yet. */
export async function missedGame(connector: LcuConnector, queues: number[], matches: UserMatch[] | undefined): Promise<number | null> {
  const last = await lastClientGame(connector, queues);
  return last && matches && !hasGame(matches, last.gameId) ? last.gameId : null;
}

/**
 * Riot publishes a match a little after it ends, so one sync right after the game often finds
 * nothing new. Asks for a sync again on a backoff (config history.newGameRetrySeconds) until that
 * game is in your history, saying it's waiting meanwhile. A newer wait replaces an older one.
 */
export class NewGameWaiter {
  private run = 0;

  constructor(
    private readonly deps: {
      /** Where your history comes from (none: nothing to wait for); read when a wait starts. */
      profiles: () => { refresh(): Promise<void> } | null;
      retrySeconds: () => number[];
      hasGame: (gameId: number) => boolean;
      /** The panel's "waiting for your last game" state. */
      pending: (waiting: boolean) => void;
      /** Every retry is used and the game isn't there: the card stops promising a result. */
      gaveUp?: (gaveUp: boolean) => void;
    },
  ) {}

  async wait(gameId: number): Promise<void> {
    const profiles = this.deps.profiles();
    if (!profiles) return;
    const refresh = () => profiles.refresh();
    const run = ++this.run;
    this.deps.pending(true);
    this.deps.gaveUp?.(false);
    try {
      await refresh();
      for (const s of this.deps.retrySeconds()) {
        if (run !== this.run || this.deps.hasGame(gameId)) return;
        await new Promise((r) => setTimeout(r, s * 1000));
        if (run !== this.run || this.deps.hasGame(gameId)) return;
        await refresh();
      }
      if (run === this.run && !this.deps.hasGame(gameId)) this.deps.gaveUp?.(true);
    } finally {
      if (run === this.run) this.deps.pending(false);
    }
  }
}

/**
 * The game ended: sends what the coach showed for it, then waits for it to reach your history.
 * The game: from the advice log, else the client's own last game.
 */
export async function afterGame(record: AdviceRecord | null, o: { connector: LcuConnector; profiles: { recordAdvice(r: AdviceRecord): Promise<unknown>; refresh(): Promise<void> } | null; queues: number[]; waiter: NewGameWaiter }): Promise<void> {
  if (record) await o.profiles?.recordAdvice(record).catch(() => {});
  const gameId = record?.gameId ?? (await lastClientGame(o.connector, o.queues))?.gameId ?? null;
  if (gameId !== null) await o.waiter.wait(gameId);
  else await o.profiles?.refresh();
}

/** The game being played (from the gameflow session): its id ties the advice shown in champ select to the game in your history. */
export async function currentGame(connector: LcuConnector): Promise<{ gameId: number | null; queueId: number | null }> {
  const session = await connector.getGameflowSession().catch(() => null);
  return { gameId: session?.gameData?.gameId ?? null, queueId: session?.gameData?.queue?.id ?? null };
}
