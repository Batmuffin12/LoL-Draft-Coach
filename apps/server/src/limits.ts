/** Fixed-window counter per key, in memory (one server process). */
export class WindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt for `key`; false when the key is over its limit for this window. */
  allow(key: string, now: number): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      if (this.windows.size > 10_000) this.prune(now);
      return true;
    }
    w.count++;
    return w.count <= this.max;
  }

  private prune(now: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}
