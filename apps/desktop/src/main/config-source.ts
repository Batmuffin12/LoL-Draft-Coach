import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { parseAppConfig, parseEngineConfig, parseExplainConfig, parseRankBandConfig } from "@ldc/engine";
import type { LoadedConfig } from "./config";
import type { ServerClient } from "./server-client";

const CacheSchema = z.object({ etag: z.string().nullable(), config: z.unknown() });

/** Validates a config downloaded from the server with the same parsers as the bundled files. Throws when invalid. */
export function parseRemoteConfig(json: unknown): LoadedConfig {
  const c = z.looseObject({ app: z.unknown(), engine: z.unknown(), bands: z.unknown(), explain: z.unknown() }).parse(json);
  return {
    app: parseAppConfig(c.app),
    engine: parseEngineConfig(c.engine),
    bands: parseRankBandConfig(c.bands),
    explain: parseExplainConfig(c.explain),
  };
}

export interface ConfigSourceDeps {
  /** The registered server client, or null (not registered, or dev-only direct mode). */
  client: () => ServerClient | null;
  /** Where the last valid server config is kept, so tuning survives restarts and offline starts. */
  cacheFile: string;
  log?: (msg: string) => void;
}

/**
 * The scoring config (weights, thresholds, wording) from the coach server, so it can be
 * tuned without an app release. The bundled config stays in use until a server copy
 * arrives and passes validation; an invalid copy is ignored, never half-applied.
 */
export class ConfigSource extends EventEmitter<{ config: [LoadedConfig] }> {
  private etag: string | null = null;
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: ConfigSourceDeps) {
    super();
    this.log = deps.log ?? ((m) => console.warn(m));
  }

  /** Applies the cached server config, if any (call at startup). */
  async loadCached(): Promise<void> {
    try {
      const cached = CacheSchema.parse(JSON.parse(await readFile(this.deps.cacheFile, "utf8")));
      const config = parseRemoteConfig(cached.config);
      this.etag = cached.etag;
      this.emit("config", config);
    } catch {
      // No cache (first run) or one from an older app version: keep the bundled config.
    }
  }

  /** Asks the server for a newer config (ETag: unchanged configs aren't downloaded again). */
  async refresh(): Promise<void> {
    const client = this.deps.client();
    if (!client) return;
    try {
      const r = await client.config(this.etag);
      if (r.notModified) return;
      const config = parseRemoteConfig(r.config);
      this.etag = r.etag;
      this.emit("config", config);
      await mkdir(dirname(this.deps.cacheFile), { recursive: true });
      await writeFile(this.deps.cacheFile, JSON.stringify({ etag: r.etag, config: r.config }));
    } catch (err) {
      this.log(`Keeping the current scoring config: ${(err as Error).message}`);
    }
  }
}
