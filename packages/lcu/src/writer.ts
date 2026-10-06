import { request } from "node:https";
import { z } from "zod";
import type { LcuCredentials } from "./credentials";
import { basicAuth, createLocalAgent, LCU_HOST } from "./http";
import { parseLcu } from "./schemas";

/**
 * The only League client writes the app may make (CLAUDE.md, approved Oct 5 and 6, 2026):
 * create or replace a rune page, write an item set, and set the player's own two summoner
 * spells, each only when the player clicks an import button. Nothing here picks, bans, locks
 * or changes a champion or skin. Every write goes through `write()`, which refuses any other
 * method, path, or (for champ select) any body field but the two spells.
 */
const ALLOWED_WRITES: readonly { method: "POST" | "PUT" | "PATCH"; path: RegExp; fields?: readonly string[] }[] = [
  { method: "POST", path: /^\/lol-perks\/v1\/pages$/ },
  { method: "PUT", path: /^\/lol-perks\/v1\/pages\/\d+$/ },
  { method: "PUT", path: /^\/lol-item-sets\/v1\/item-sets\/\d+\/sets$/ },
  { method: "PATCH", path: /^\/lol-champ-select\/v1\/session\/my-selection$/, fields: ["spell1Id", "spell2Id"] },
];
export const MY_SELECTION = "/lol-champ-select/v1/session/my-selection";

/** Rune pages and item sets the app wrote start with this, so it replaces its own page instead of adding more. */
export const IMPORT_PREFIX = "LDC: ";

export class LcuWriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: "notAllowed" | "pagesFull" | "failed",
  ) {
    super(message);
  }
}

export interface RunePageImport {
  /** Shown in the client; IMPORT_PREFIX is added. */
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  /** Six runes (keystone first), then the shards in the client's order: offense, flex, defense. */
  selectedPerkIds: number[];
}

export interface ItemSetImport {
  /** Shown in the client; IMPORT_PREFIX is added. */
  title: string;
  championId: number;
  mapId: number;
  blocks: { type: string; items: number[] }[];
}

const PagesSchema = z.array(z.looseObject({ id: z.number().int(), name: z.string(), isEditable: z.boolean().optional() }));
const SummonerSchema = z.looseObject({ summonerId: z.number().int() });
const CHAMP_SELECT = "/lol-champ-select/v1/session";
const SessionSpellsSchema = z.looseObject({
  localPlayerCellId: z.number().int(),
  myTeam: z.array(z.looseObject({ cellId: z.number().int(), spell1Id: z.number().optional(), spell2Id: z.number().optional() })).default([]),
});
const ItemSetsSchema = z.looseObject({ itemSets: z.array(z.looseObject({ uid: z.string().optional() })).default([]) });

export const PERKS_PAGES = "/lol-perks/v1/pages";
const CURRENT_SUMMONER = "/lol-summoner/v1/current-summoner";
const itemSetsPath = (summonerId: number) => `/lol-item-sets/v1/item-sets/${summonerId}/sets`;

/**
 * Flag-gated importer for the loadout (the app creates it only when import is enabled, and
 * calls it only from an import button). Reads with GET; writes only through the allowlist.
 */
export class LcuImporter {
  private readonly agent = createLocalAgent();

  constructor(
    private readonly creds: LcuCredentials,
    private readonly host: string = LCU_HOST,
  ) {}

  private send(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = request(
        {
          host: this.host,
          port: this.creds.port,
          path,
          method,
          agent: this.agent,
          headers: {
            Authorization: basicAuth(this.creds),
            Accept: "application/json",
            ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          },
          timeout: 5_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let data: unknown = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch {
              data = text;
            }
            resolve({ status: res.statusCode ?? 0, data });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`LCU ${method} ${path} timed out`)));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  private async read<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
    const r = await this.send("GET", path);
    if (r.status < 200 || r.status >= 300) throw new LcuWriteError(`LCU GET ${path} failed with HTTP ${r.status}`, r.status, "failed");
    return parseLcu(schema, path, r.data);
  }

  /** The single gate for writes: only the allowlisted rune page and item set calls pass. */
  async write(method: "POST" | "PUT" | "PATCH", path: string, body: unknown): Promise<unknown> {
    const rule = ALLOWED_WRITES.find((w) => w.method === method && w.path.test(path));
    const fieldsOk =
      !rule?.fields ||
      (typeof body === "object" && body !== null && Object.keys(body).length > 0 && Object.keys(body).every((k) => rule.fields!.includes(k)));
    if (!rule || !fieldsOk) {
      throw new LcuWriteError(`Refused LCU ${method} ${path}: the app only writes rune pages, item sets and your own summoner spells`, 0, "notAllowed");
    }
    const r = await this.send(method, path, body);
    if (r.status >= 200 && r.status < 300) return r.data;
    // The client answers 400 when every rune page slot is taken.
    if (method === "POST" && path === PERKS_PAGES && r.status === 400) {
      throw new LcuWriteError("All your rune pages are in use: delete one in the client, then import again.", r.status, "pagesFull");
    }
    throw new LcuWriteError(`LCU ${method} ${path} failed with HTTP ${r.status}`, r.status, "failed");
  }

  /** Creates the rune page, or replaces the page the app made before. Makes it the current page. */
  async importRunePage(page: RunePageImport): Promise<"created" | "replaced"> {
    const pages = await this.read(PERKS_PAGES, PagesSchema);
    const ours = pages.find((p) => p.name.startsWith(IMPORT_PREFIX) && p.isEditable !== false);
    const body = { ...page, name: `${IMPORT_PREFIX}${page.name}`.slice(0, 25), current: true };
    if (ours) {
      await this.write("PUT", `${PERKS_PAGES}/${ours.id}`, { ...body, id: ours.id });
      return "replaced";
    }
    await this.write("POST", PERKS_PAGES, body);
    return "created";
  }

  /** Writes the item set for the champion, replacing the one the app wrote before for it. Other sets are kept. */
  async importItemSet(set: ItemSetImport): Promise<void> {
    const { summonerId } = await this.read(CURRENT_SUMMONER, SummonerSchema);
    const path = itemSetsPath(summonerId);
    const current = await this.read(path, ItemSetsSchema);
    const uid = `ldc-${set.championId}`;
    const ours = {
      uid,
      title: `${IMPORT_PREFIX}${set.title}`,
      type: "custom",
      map: "any",
      mode: "any",
      sortrank: 0,
      startedFrom: "blank",
      associatedChampions: [set.championId],
      associatedMaps: [set.mapId],
      preferredItemSlots: [],
      blocks: set.blocks.map((b) => {
        const counts = new Map<number, number>();
        for (const id of b.items) counts.set(id, (counts.get(id) ?? 0) + 1);
        return { type: b.type, items: [...counts].map(([id, count]) => ({ id: String(id), count })) };
      }),
    };
    await this.write("PUT", path, { ...current, itemSets: [...current.itemSets.filter((s) => s.uid !== uid), ours] });
  }

  /**
   * Sets your own two summoner spells in champ select. Keeps a spell on the key it's on now
   * (e.g. Flash on D or F); the other spell takes the remaining key.
   */
  async importSpells(spells: [number, number]): Promise<void> {
    const session = await this.read(CHAMP_SELECT, SessionSpellsSchema);
    const me = session.myTeam.find((m) => m.cellId === session.localPlayerCellId);
    const [a, b] = spells;
    let pair: [number, number] = [a, b];
    if (me?.spell1Id === b || me?.spell2Id === a) pair = [b, a];
    await this.write("PATCH", MY_SELECTION, { spell1Id: pair[0], spell2Id: pair[1] });
  }

  close(): void {
    this.agent.destroy();
  }
}
