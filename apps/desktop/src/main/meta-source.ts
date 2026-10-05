import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { MetaSnapshot, RankBandId } from "@ldc/shared";
import { MetaSnapshotSchema, type ServerClient } from "./server-client";

/** What the panel shows about the live meta. */
export type MetaStatus =
  | { state: "none" }
  | { state: "ready"; band: RankBandId; patch: string | null; matches: number; createdAt: number; offline: boolean }
  | { state: "error"; message: string };

const CacheSchema = z.object({ etag: z.string().nullable(), snapshot: MetaSnapshotSchema });

export interface MetaSourceDeps {
  /** The registered server client, or null (not registered, or dev-only direct mode). */
  client: () => ServerClient | null;
  /** Folder for the last snapshot per band, so the coach works while the server is down. */
  cacheDir: string;
  now?: () => number;
  /** Don't ask the server again within this time (each check can wake a sleeping server). */
  minIntervalMs?: number;
}

/**
 * The live meta for the player's band. Keeps the last snapshot on disk, asks the server
 * for a newer one (ETag: unchanged snapshots aren't downloaded again), and falls back to
 * the cached copy when the server can't be reached.
 */
export class MetaSource extends EventEmitter<{ snapshot: [MetaSnapshot]; status: [MetaStatus] }> {
  private current: { band: RankBandId; etag: string | null; snapshot: MetaSnapshot } | null = null;
  private checkedAt = new Map<RankBandId, number>();
  private chain: Promise<void> = Promise.resolve();
  private pending: { band: RankBandId; promise: Promise<void> } | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: MetaSourceDeps) {
    super();
    this.now = deps.now ?? Date.now;
  }

  get snapshot(): MetaSnapshot | null {
    return this.current?.snapshot ?? null;
  }

  private file(band: RankBandId): string {
    return join(this.deps.cacheDir, `meta-band-${band}.json`);
  }

  private async readCache(band: RankBandId): Promise<{ etag: string | null; snapshot: MetaSnapshot } | null> {
    try {
      const parsed = CacheSchema.safeParse(JSON.parse(await readFile(this.file(band), "utf8")));
      return parsed.success && parsed.data.snapshot.band === band ? (parsed.data as { etag: string | null; snapshot: MetaSnapshot }) : null;
    } catch {
      return null;
    }
  }

  private use(band: RankBandId, etag: string | null, snapshot: MetaSnapshot, offline: boolean): void {
    const changed = this.current?.snapshot !== snapshot;
    this.current = { band, etag, snapshot };
    if (changed) this.emit("snapshot", snapshot);
    this.emit("status", { state: "ready", band, patch: snapshot.patch, matches: snapshot.matches, createdAt: snapshot.createdAt, offline });
  }

  /** Makes sure the band's snapshot is loaded and recent; `force` skips the minimum interval. */
  refresh(band: RankBandId, opts: { force?: boolean } = {}): Promise<void> {
    // Loads run one after another. A request for the band already pending joins it; another
    // band (e.g. the player just changed rank band) is queued, never dropped.
    if (this.pending && this.pending.band === band && !opts.force) return this.pending.promise;
    const promise: Promise<void> = this.chain
      .then(() => this.load(band, opts.force ?? false))
      .finally(() => {
        if (this.pending?.promise === promise) this.pending = null;
      });
    this.chain = promise.catch(() => {});
    this.pending = { band, promise };
    return promise;
  }

  private async load(band: RankBandId, force: boolean): Promise<void> {
    if (this.current?.band !== band) {
      const cached = await this.readCache(band);
      if (cached) this.use(band, cached.etag, cached.snapshot, false);
      else this.current = null;
    }
    const client = this.deps.client();
    if (!client) {
      if (!this.current) this.emit("status", { state: "none" });
      return;
    }
    const last = this.checkedAt.get(band);
    if (!force && last !== undefined && this.now() - last < (this.deps.minIntervalMs ?? 30 * 60_000)) return;

    try {
      const r = await client.meta(band, this.current?.band === band ? this.current.etag : null);
      this.checkedAt.set(band, this.now());
      if (r.notModified) {
        if (this.current) this.use(band, this.current.etag, this.current.snapshot, false);
        return;
      }
      this.use(band, r.etag, r.snapshot, false);
      await mkdir(this.deps.cacheDir, { recursive: true });
      await writeFile(this.file(band), JSON.stringify({ etag: r.etag, snapshot: r.snapshot }));
    } catch (err) {
      // Keep coaching from the last snapshot; say so.
      if (this.current) this.use(band, this.current.etag, this.current.snapshot, true);
      else this.emit("status", { state: "error", message: (err as Error).message });
    }
  }
}
