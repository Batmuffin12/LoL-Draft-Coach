import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { z } from "zod";
import type { ChampionId, ChampionInfo, ItemInfo, RuneInfo, SpellInfo } from "@ldc/shared";

export const DEFAULT_BASE_URL = "https://ddragon.leagueoflegends.com";

/** CommunityDragon's public mirror of the client's game-data files (the spec's "LCU game data / CommunityDragon"). */
export const COMMUNITY_DRAGON_GAME_DATA = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/";

/**
 * The public CommunityDragon URL for an icon path the League client reports (e.g. a stat
 * shard's "/lol-game-data/assets/v1/perk-images/StatMods/…png"). The client serves its own
 * copy only with its local password, so the panel loads the mirror. Null for other paths.
 */
export function communityDragonAsset(clientPath: string, base = COMMUNITY_DRAGON_GAME_DATA): string | null {
  const prefix = "/lol-game-data/assets/";
  if (!clientPath.toLowerCase().startsWith(prefix)) return null;
  return base + clientPath.slice(prefix.length).toLowerCase();
}

const VersionsSchema = z.array(z.string().min(1)).min(1);

/** CommunityDragon's rune paths (slots with perk ids) and perks (names, client icon paths): only the fields we use. */
const PerkStylesFileSchema = z.looseObject({
  styles: z.array(z.looseObject({ id: z.number(), slots: z.array(z.looseObject({ type: z.string().default(""), perks: z.array(z.number()).default([]) })).default([]) })),
});
const PerksFileSchema = z.array(z.looseObject({ id: z.number(), name: z.string(), iconPath: z.string().default("") }));

/** The stat shard rows (offense, flex, defense) and each shard's name and icon. */
export interface StatShards {
  rows: number[][];
  perks: Map<number, { name: string; iconUrl: string | null }>;
}

const ChampionFileSchema = z.looseObject({
  version: z.string(),
  data: z.record(
    z.string(),
    z.looseObject({
      id: z.string(),
      key: z.string().regex(/^\d+$/),
      name: z.string(),
      image: z.looseObject({ full: z.string() }),
      /** Riot's 0–10 ratings and class tags (used for champion similarity; optional, so a change can't break loading). */
      info: z.looseObject({ attack: z.number(), defense: z.number(), magic: z.number(), difficulty: z.number() }).optional(),
      tags: z.array(z.string()).default([]),
    }),
  ),
});

const ItemFileSchema = z.looseObject({
  data: z.record(
    z.string(),
    z.looseObject({
      name: z.string(),
      stats: z.record(z.string(), z.number()).default({}),
      image: z.looseObject({ full: z.string() }).optional(),
      gold: z.looseObject({ total: z.number().default(0), purchasable: z.boolean().default(true) }).default({ total: 0, purchasable: true }),
      into: z.array(z.string()).default([]),
      from: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      maps: z.record(z.string(), z.boolean()).default({}),
      inStore: z.boolean().optional(),
      hideFromAll: z.boolean().optional(),
      requiredChampion: z.string().optional(),
    }),
  ),
});

const RunesFileSchema = z.array(
  z.looseObject({
    id: z.number(),
    key: z.string(),
    name: z.string(),
    icon: z.string().default(""),
    slots: z.array(z.looseObject({ runes: z.array(z.looseObject({ id: z.number(), name: z.string(), icon: z.string().default("") })).default([]) })),
  }),
);

const SummonerFileSchema = z.looseObject({
  data: z.record(z.string(), z.looseObject({ id: z.string(), key: z.string(), name: z.string(), image: z.looseObject({ full: z.string() }).optional() })),
});

/** The static data files we load for each patch, with their validators. */
const FILES = {
  champion: ChampionFileSchema,
  item: ItemFileSchema,
  runesReforged: RunesFileSchema,
  summoner: SummonerFileSchema,
} as const;
type FileName = keyof typeof FILES;
type RawFiles = { [K in FileName]: z.infer<(typeof FILES)[K]> };

export interface StaticData {
  version: string;
  locale: string;
  champions: Map<ChampionId, ChampionInfo>;
  /** Items, runes (paths included) and summoner spells by numeric id. */
  itemInfo: Map<number, ItemInfo>;
  runeInfo: Map<number, RuneInfo>;
  spellInfo: Map<number, SpellInfo>;
  items: RawFiles["item"];
  runes: RawFiles["runesReforged"];
  summonerSpells: RawFiles["summoner"];
}

export interface DataDragonOptions {
  cacheDir: string;
  locale?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class DataDragonError extends Error {}

/**
 * Data Dragon adapter. On load it reads versions.json, and when the newest version
 * differs from the cached one it downloads every static file for the new patch.
 * Works offline from the cache.
 */
export class DataDragon extends EventEmitter<{ patch: [StaticData] }> {
  private current: StaticData | null = null;
  private readonly base: string;
  private readonly locale: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: DataDragonOptions) {
    super();
    this.base = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.locale = opts.locale ?? "en_US";
    this.fetchFn = opts.fetch ?? fetch;
  }

  get data(): StaticData {
    if (!this.current) throw new DataDragonError("Data Dragon not loaded yet");
    return this.current;
  }

  /** Newest version according to versions.json (first entry). */
  async latestVersion(): Promise<string> {
    const versions = VersionsSchema.parse(await this.getJson(`${this.base}/api/versions.json`));
    return versions[0]!;
  }

  /**
   * Loads static data for the newest patch. Returns true when a new patch was
   * downloaded (and emits "patch"), false when the cache was already current.
   */
  async load(): Promise<boolean> {
    let latest: string;
    try {
      latest = await this.latestVersion();
    } catch (err) {
      const cached = await this.readCachedVersion();
      if (!cached) throw new DataDragonError(`Data Dragon unreachable and no cached data: ${String(err)}`);
      this.setCurrent(await this.readCache(cached));
      return false;
    }

    const cachedVersion = await this.readCachedVersion();
    if (cachedVersion === latest) {
      try {
        this.setCurrent(await this.readCache(latest));
        return false;
      } catch {
        // Corrupt cache: fall through and re-download.
      }
    }

    const raw = {} as RawFiles;
    for (const name of Object.keys(FILES) as FileName[]) {
      const json = await this.getJson(`${this.base}/cdn/${latest}/data/${this.locale}/${name}.json`);
      (raw as Record<FileName, unknown>)[name] = this.validate(name, json);
    }
    await this.writeCache(latest, raw);
    this.setCurrent(this.build(latest, raw));
    return true;
  }

  /** Swaps in new data and emits "patch" whenever the in-memory version changes. */
  private setCurrent(data: StaticData): void {
    const changed = this.current?.version !== data.version;
    this.current = data;
    if (changed) this.emit("patch", data);
  }

  private shards: { version: string; value: StatShards } | null = null;

  /**
   * The stat shard rows and names from CommunityDragon's game data (Data Dragon has none), for
   * when the League client doesn't list them. Cached in memory and on disk per patch; null when
   * unreachable without a cached copy, or before Data Dragon is loaded.
   */
  async statShards(): Promise<StatShards | null> {
    const version = this.current?.version;
    if (!version) return null;
    if (this.shards?.version === version) return this.shards.value;
    const file = join(this.versionDir(version), "statShards.json");
    let raw: { styles: unknown; perks: unknown };
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch {
      try {
        raw = { styles: await this.getJson(`${COMMUNITY_DRAGON_GAME_DATA}v1/perkstyles.json`), perks: await this.getJson(`${COMMUNITY_DRAGON_GAME_DATA}v1/perks.json`) };
      } catch {
        return null;
      }
      await mkdir(this.versionDir(version), { recursive: true }).then(() => writeFile(file, JSON.stringify(raw), "utf8")).catch(() => undefined);
    }
    const styles = PerkStylesFileSchema.safeParse(raw.styles);
    const perks = PerksFileSchema.safeParse(raw.perks);
    if (!styles.success || !perks.success) return null;
    const rows = styles.data.styles.map((s) => s.slots.filter((x) => x.type === "kStatMod").map((x) => x.perks)).find((r) => r.length > 0) ?? [];
    const ids = new Set(rows.flat());
    const value: StatShards = {
      rows,
      perks: new Map(perks.data.filter((p) => ids.has(p.id)).map((p) => [p.id, { name: p.name, iconUrl: communityDragonAsset(p.iconPath) }])),
    };
    this.shards = { version, value };
    return value;
  }

  champion(id: ChampionId): ChampionInfo | undefined {
    return this.current?.champions.get(id);
  }

  private validate(name: FileName, json: unknown): unknown {
    const r = FILES[name].safeParse(json);
    if (!r.success) throw new DataDragonError(`Data Dragon ${name}.json changed shape:\n${z.prettifyError(r.error)}`);
    return r.data;
  }

  private build(version: string, raw: RawFiles): StaticData {
    const champions = new Map<ChampionId, ChampionInfo>();
    for (const c of Object.values(raw.champion.data)) {
      const id = Number(c.key);
      champions.set(id, {
        id,
        key: c.id,
        name: c.name,
        iconUrl: `${this.base}/cdn/${version}/img/champion/${c.image.full}`,
        ...(c.info ? { info: { attack: c.info.attack, defense: c.info.defense, magic: c.info.magic, difficulty: c.info.difficulty } } : {}),
        tags: c.tags,
      });
    }
    const cdn = `${this.base}/cdn/${version}/img`;
    const itemInfo = new Map<number, ItemInfo>();
    for (const [key, it] of Object.entries(raw.item.data)) {
      const id = Number(key);
      if (!Number.isInteger(id)) continue;
      itemInfo.set(id, {
        id,
        name: it.name,
        iconUrl: `${cdn}/item/${it.image?.full ?? `${key}.png`}`,
        gold: it.gold.total,
        into: it.into.map(Number),
        from: it.from.map(Number),
        tags: it.tags,
        maps: Object.entries(it.maps).filter(([, on]) => on).map(([m]) => m),
        purchasable: it.gold.purchasable && it.inStore !== false && it.hideFromAll !== true,
        requiredChampion: it.requiredChampion ?? null,
        stats: it.stats,
      });
    }
    const runeInfo = new Map<number, RuneInfo>();
    for (const style of raw.runesReforged) {
      runeInfo.set(style.id, { id: style.id, name: style.name, iconUrl: `${this.base}/cdn/img/${style.icon}`, styleId: style.id });
      for (const slot of style.slots)
        for (const r of slot.runes) runeInfo.set(r.id, { id: r.id, name: r.name, iconUrl: `${this.base}/cdn/img/${r.icon}`, styleId: style.id });
    }
    const spellInfo = new Map<number, SpellInfo>();
    for (const s of Object.values(raw.summoner.data)) {
      const id = Number(s.key);
      if (Number.isInteger(id)) spellInfo.set(id, { id, name: s.name, iconUrl: `${cdn}/spell/${s.image?.full ?? `${s.id}.png`}` });
    }
    return { version, locale: this.locale, champions, itemInfo, runeInfo, spellInfo, items: raw.item, runes: raw.runesReforged, summonerSpells: raw.summoner };
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchFn(url);
    if (!res.ok) throw new DataDragonError(`GET ${url} failed with HTTP ${res.status}`);
    return res.json();
  }

  private versionDir(version: string): string {
    return join(this.opts.cacheDir, `${version}_${this.locale}`);
  }

  private async readCachedVersion(): Promise<string | null> {
    try {
      const meta = JSON.parse(await readFile(join(this.opts.cacheDir, "current.json"), "utf8")) as { version?: string; locale?: string };
      return meta.locale === this.locale && meta.version ? meta.version : null;
    } catch {
      return null;
    }
  }

  private async readCache(version: string): Promise<StaticData> {
    const raw = {} as RawFiles;
    for (const name of Object.keys(FILES) as FileName[]) {
      const json = JSON.parse(await readFile(join(this.versionDir(version), `${name}.json`), "utf8"));
      (raw as Record<FileName, unknown>)[name] = this.validate(name, json);
    }
    return this.build(version, raw);
  }

  private async writeCache(version: string, raw: RawFiles): Promise<void> {
    const dir = this.versionDir(version);
    await mkdir(dir, { recursive: true });
    for (const [name, json] of Object.entries(raw)) await writeFile(join(dir, `${name}.json`), JSON.stringify(json), "utf8");
    await writeFile(join(this.opts.cacheDir, "current.json"), JSON.stringify({ version, locale: this.locale }), "utf8");
    // Only the current patch is kept; older ones are re-downloadable.
    for (const d of await readdir(this.opts.cacheDir, { withFileTypes: true })) {
      if (d.isDirectory() && d.name !== `${version}_${this.locale}`) {
        await rm(join(this.opts.cacheDir, d.name), { recursive: true, force: true });
      }
    }
  }
}
