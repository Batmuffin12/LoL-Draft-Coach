import { eq, gt, isNull, or } from "drizzle-orm";
import { RiotKeyError } from "@ldc/riot-api";
import type { Db } from "./db";
import { users } from "./db/schema";
import { syncUser, usersDueForSync, type SyncResult, type SyncRiot, type SyncSettings } from "./sync";

export type SyncState =
  | { state: "idle" }
  | { state: "running"; done: number; total: number; startedAt: number }
  | { state: "done"; result: SyncResult; finishedAt: number }
  | { state: "error"; message: string; finishedAt: number };

export interface SchedulerOptions {
  /** How often the background loop looks for users to sync. */
  tickMs: number;
  /** A user's history is refreshed when their last sync is older than this. */
  staleAfterMs: number;
  /** Only users seen within this window are synced in the background. */
  activeWithinMs: number;
  now?: () => number;
  log?: (msg: string) => void;
}

/**
 * Runs user syncs: on request (registration, POST /me/sync) and in the background for
 * recently active users. At most one sync per user runs at a time; requests for a
 * user already syncing join the running one. All Riot calls share one rate limiter
 * (inside the RiotApi adapter), so background syncs simply queue behind each other.
 */
export class SyncScheduler {
  private readonly running = new Map<number, Promise<SyncResult>>();
  private readonly states = new Map<number, SyncState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;

  constructor(
    private readonly db: Db,
    private readonly riot: SyncRiot,
    private readonly settings: SyncSettings,
    private readonly opts: SchedulerOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(m));
  }

  state(userId: number): SyncState {
    return this.states.get(userId) ?? { state: "idle" };
  }

  /** Starts (or joins) a sync for one user; `callsPerSync` overrides the configured budget. */
  request(userId: number, callsPerSync?: number): Promise<SyncResult> {
    const existing = this.running.get(userId);
    if (existing) return existing;
    const user = this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return Promise.reject(new Error(`No user ${userId}`));

    this.states.set(userId, { state: "running", done: 0, total: 0, startedAt: this.now() });
    const settings = callsPerSync ? { ...this.settings, history: { ...this.settings.history, callsPerSync } } : this.settings;
    const p = syncUser(this.db, this.riot, user, settings, this.now(), (done, total) =>
      this.states.set(userId, { state: "running", done, total, startedAt: this.now() }),
    )
      .then((result) => {
        this.states.set(userId, { state: "done", result, finishedAt: this.now() });
        return result;
      })
      .catch((err: unknown) => {
        // A deleted user mid-sync is not an error worth reporting.
        if (!this.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) this.states.delete(userId);
        else this.states.set(userId, { state: "error", message: (err as Error).message, finishedAt: this.now() });
        throw err;
      })
      .finally(() => this.running.delete(userId));
    this.running.set(userId, p);
    return p;
  }

  /**
   * The hourly wake-up's share of loading long histories: every user whose history is still
   * loading gets a sync with `history.backfillCallsPerWake` calls, one after another. Their calls
   * go before the collector's (rate limiter priorities). No timer: it runs inside the wake-up.
   */
  async backfill(): Promise<void> {
    const calls = this.settings.history.backfillCallsPerWake ?? this.settings.history.callsPerSync;
    const pending = this.db
      .select({ id: users.id })
      .from(users)
      .where(or(isNull(users.historyBacklog), gt(users.historyBacklog, 0)))
      .all();
    for (const { id } of pending) {
      try {
        const r = await this.request(id, calls);
        this.log(`backfill: user ${id} +${r.newMatches} matches, ${r.remaining} to go`);
      } catch (err) {
        this.log(`backfill: user ${id} failed: ${(err as Error).message}`);
        if (err instanceof RiotKeyError) return;
      }
    }
  }

  /** Forgets a user's state (after DELETE /me). */
  forget(userId: number): void {
    this.states.delete(userId);
  }

  /** One background pass: syncs due users one after another. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const user of usersDueForSync(this.db, this.now(), this.opts.staleAfterMs, this.opts.activeWithinMs)) {
        try {
          const r = await this.request(user.id);
          if (r.newMatches) this.log(`sync: user ${user.id} +${r.newMatches} matches (${r.totalMatches} stored)`);
        } catch (err) {
          this.log(`sync: user ${user.id} failed: ${(err as Error).message}`);
          if (err instanceof RiotKeyError) return; // Every call will fail until the key is fixed.
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.opts.tickMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
