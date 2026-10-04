/**
 * One rate limiter for every Riot API call. Limits are never hardcoded: they are
 * learned from Riot's X-App-Rate-Limit / X-Method-Rate-Limit headers (and their
 * -Count companions). Until a scope's limits are known, it allows one request in
 * flight. User requests always go before collector requests. A 429 blocks the
 * scope named by X-Rate-Limit-Type for Retry-After seconds, then the call is retried.
 */

export type Priority = "user" | "collector";
const PRIORITY_ORDER: Record<Priority, number> = { user: 0, collector: 1 };

export interface RateLimit {
  max: number;
  windowMs: number;
}

/** Parses "20:1,100:120" (count:seconds pairs). Invalid parts are skipped. */
export function parseRateLimitHeader(value: string | null | undefined): RateLimit[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().split(":").map(Number))
    .filter((p): p is [number, number] => p.length === 2 && p.every((n) => Number.isFinite(n) && n > 0))
    .map(([max, sec]) => ({ max, windowMs: sec * 1000 }));
}

/** Parses "-Count" headers ("3:1,40:120") into counts keyed by window length. */
export function parseRateLimitCount(value: string | null | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const { max, windowMs } of parseRateLimitHeader(value)) out.set(windowMs, max);
  return out;
}

/** A sliding-window log for one scope (the app on a host, or one method on a host). */
export class Scope {
  limits: RateLimit[] = [];
  private log: number[] = [];
  inFlight = 0;
  blockedUntil = 0;

  /** Milliseconds until a request may start in this scope (0 = now). */
  waitMs(now: number): number {
    if (this.blockedUntil > now) return this.blockedUntil - now;
    if (this.limits.length === 0) return this.inFlight > 0 ? Infinity : 0; // learning: one at a time
    let wait = 0;
    for (const { max, windowMs } of this.limits) {
      const inWindow = this.log.filter((t) => t > now - windowMs);
      // In-flight requests are already in the log.
      if (inWindow.length >= max) wait = Math.max(wait, inWindow[inWindow.length - max]! + windowMs - now);
    }
    return wait;
  }

  record(now: number): void {
    this.log.push(now);
    this.inFlight++;
  }

  /** Applies limits and server-side counts from a response. */
  sync(limits: RateLimit[], counts: Map<number, number>, now: number): void {
    if (limits.length) this.limits = limits;
    for (const [windowMs, count] of counts) {
      const local = this.log.filter((t) => t > now - windowMs).length;
      for (let i = local; i < count; i++) this.log.push(now);
    }
    const longest = Math.max(0, ...this.limits.map((l) => l.windowMs));
    this.log = this.log.filter((t) => t > now - longest).sort((a, b) => a - b);
  }
}

export interface ScheduleOptions {
  /** App-limit scope, e.g. the routing host. */
  appScope: string;
  /** Method-limit scope, e.g. host + endpoint id. */
  methodScope: string;
  priority: Priority;
}

export interface LimiterOptions {
  now?: () => number;
  /** Retries after 429/503 before giving up. */
  maxRetries?: number;
  /** Backoff when a 429 arrives without Retry-After (doubles per retry). */
  fallbackBackoffMs?: number;
}

interface QueueItem {
  opts: ScheduleOptions;
  task: () => Promise<Response>;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
  seq: number;
  attempts: number;
}

export class RateLimiter {
  private readonly scopes = new Map<string, Scope>();
  private queue: QueueItem[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly fallbackBackoffMs: number;

  constructor(opts: LimiterOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fallbackBackoffMs = opts.fallbackBackoffMs ?? 1_000;
  }

  scope(key: string): Scope {
    let s = this.scopes.get(key);
    if (!s) this.scopes.set(key, (s = new Scope()));
    return s;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Runs `task` when both scopes allow it; resolves with the final (non-429) response. */
  schedule(opts: ScheduleOptions, task: () => Promise<Response>): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.queue.push({ opts, task, resolve, reject, seq: this.seq++, attempts: 0 });
      this.pump();
    });
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => PRIORITY_ORDER[a.opts.priority] - PRIORITY_ORDER[b.opts.priority] || a.seq - b.seq);
  }

  private pump(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.sortQueue();
    let minWait = Infinity;
    const now = this.now();
    // A higher-priority item waiting on the app scope reserves it: lower-priority items
    // for the same app scope may not jump ahead of it.
    const reservedApps = new Set<string>();
    for (const item of [...this.queue]) {
      const app = this.scope(item.opts.appScope);
      const method = this.scope(item.opts.methodScope);
      if (reservedApps.has(item.opts.appScope)) continue;
      const wait = Math.max(app.waitMs(now), method.waitMs(now));
      if (wait === 0) {
        this.queue.splice(this.queue.indexOf(item), 1);
        app.record(now);
        method.record(now);
        void this.run(item, app, method);
      } else {
        if (app.waitMs(now) > 0) reservedApps.add(item.opts.appScope);
        minWait = Math.min(minWait, wait);
      }
    }
    if (this.queue.length && Number.isFinite(minWait)) {
      this.timer = setTimeout(() => this.pump(), Math.max(1, minWait));
    }
  }

  private async run(item: QueueItem, app: Scope, method: Scope): Promise<void> {
    let res: Response;
    try {
      res = await item.task();
    } catch (err) {
      app.inFlight--;
      method.inFlight--;
      item.reject(err);
      this.pump();
      return;
    }
    app.inFlight--;
    method.inFlight--;
    const now = this.now();
    const h = res.headers;
    app.sync(parseRateLimitHeader(h.get("x-app-rate-limit")), parseRateLimitCount(h.get("x-app-rate-limit-count")), now);
    method.sync(parseRateLimitHeader(h.get("x-method-rate-limit")), parseRateLimitCount(h.get("x-method-rate-limit-count")), now);

    if ((res.status === 429 || res.status === 503) && item.attempts < this.maxRetries) {
      const retryAfterSec = Number(h.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : this.fallbackBackoffMs * 2 ** item.attempts;
      const type = h.get("x-rate-limit-type");
      const blocked = type === "application" ? app : method;
      blocked.blockedUntil = Math.max(blocked.blockedUntil, now + waitMs);
      item.attempts++;
      this.queue.push(item); // keeps its original seq, so it stays ahead of newer items
    } else {
      item.resolve(res);
    }
    this.pump();
  }
}
