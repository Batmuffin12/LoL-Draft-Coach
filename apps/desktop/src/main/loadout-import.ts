import { renderReason, runePageKey, type Loadout } from "@ldc/engine";
import { LcuWriteError, type LcuImporter } from "@ldc/lcu";
import type { ImportLine } from "../shared/view";
import type { LoadedConfig } from "./config";
import { reportProblem } from "./crash-reports";

/** What importing needs from the LCU writer (the single approved LCU write exception, CLAUDE.md). */
export type LoadoutWriter = Pick<LcuImporter, "importRunePage" | "importSpells" | "importItemSet">;

export interface ImportOptions {
  /** Renders an explain template ("import.runes.done", ...). */
  say: (id: string, slots?: Record<string, string | number>) => string;
  /** Data Dragon map id for the item set (Summoner's Rift). */
  mapId: number;
  /** Where the technical detail of a failure goes (crash reports); the player gets plain wording. */
  report?: (detail: string) => void;
}

/**
 * Writes a shown loadout into the League client and returns what to tell the player, a line per outcome:
 * "runes" = the rune page and the two summoner spells (one button; one failing doesn't stop the
 * other), "items" = the item set. Called only from the player's click on an import button.
 */
export async function importLoadout(kind: "runes" | "items", shown: { loadout: Loadout; champion: string }, writer: LoadoutWriter, opts: ImportOptions): Promise<string[]> {
  const { say } = opts;
  const failure = (part: "runes" | "spells" | "items", err: unknown) => {
    if (err instanceof LcuWriteError && err.reason === "pagesFull") return say("import.runes.full");
    opts.report?.(`Import of ${part}: ${(err as Error).message}`);
    return say(`import.failed.${part}`);
  };
  const l = shown.loadout;
  try {
    if (kind === "runes") {
      const done: string[] = [];
      if (l.page) {
        const p = l.page.value;
        // Stored shards are in Riot's match order (defense, flex, offense); the client wants offense, flex, defense.
        await writer
          .importRunePage({ name: shown.champion, primaryStyleId: p.primaryStyle, subStyleId: p.subStyle, selectedPerkIds: [...p.runes, ...[...p.statPerks].reverse()] })
          .then((result) => done.push(say(`import.runes.${result}`)), (err: unknown) => done.push(failure("runes", err)));
      }
      const s = l.spells?.value;
      if (s?.length === 2) await writer.importSpells([s[0]!, s[1]!]).then(() => done.push(say("import.spells.done")), (err: unknown) => done.push(failure("spells", err)));
      return done;
    }
    // A full build: start, boots, the core (items 1-3) and later items (4+), what to buy
    // against this enemy team (one block per need), and the other options players take.
    const path = l.core?.value ?? [];
    const onPath = new Set([...path, ...(l.boots ? [l.boots.top.itemId] : [])]);
    const others = [...new Set([...l.items.flatMap((s) => s.alternatives.map((a) => a.itemId)), ...(l.boots?.alternatives.map((a) => a.itemId) ?? [])])].filter((id) => !onPath.has(id));
    const byTrait = new Map<string, number[]>();
    for (const s of l.situational) byTrait.set(s.trait, [...(byTrait.get(s.trait) ?? []), s.itemId]);
    const blocks = [
      { type: say("import.block.starting"), items: l.starting?.value ?? [] },
      { type: say("import.block.boots"), items: l.boots ? [l.boots.top.itemId] : [] },
      { type: say("import.block.core"), items: path.slice(0, 3) },
      l.laterPool.length ? { type: say("import.block.laterPool"), items: l.laterPool.map((x) => x.itemId) } : { type: say("import.block.later"), items: path.slice(3) },
      ...[...byTrait].map(([trait, items]) => ({ type: say(`import.block.situational.${trait}`), items })),
      { type: say("import.block.alternatives"), items: others },
    ].filter((b) => b.items.length > 0);
    if (!blocks.length) return [];
    await writer.importItemSet({ title: `${shown.champion} ${l.role}`, championId: l.championId, mapId: opts.mapId, blocks });
    return [say("import.items.done")];
  } catch (err) {
    return [failure("items", err)];
  }
}

/**
 * The rune option the player saw, found by its key because the options are rebuilt on every draft
 * update and can reorder between render and click. Undefined when it's no longer offered; without
 * a key, the first page.
 */
export function pageToImport(l: Pick<Loadout, "page" | "pageAlt">, pageKey?: string): Loadout["page"] | undefined {
  if (pageKey === undefined) return l.page;
  return [l.page, l.pageAlt].find((p) => p !== null && runePageKey(p.value) === pageKey);
}

/**
 * The panel's one import button: "runes" = the rune page and your two summoner spells, "items" =
 * the item set, "all" = both, one after the other. `pageKey` is the rune option the player chose;
 * when it's gone, nothing is written rather than a page they didn't see. Returns what to tell the
 * player (always something, a line per outcome, each marked when it failed) and closes the writer. Only ever called
 * from the player's click (CLAUDE.md: the single approved LCU write exception).
 */
export async function importShownLoadout(
  kind: "runes" | "items" | "all",
  shown: { loadout: Loadout; champion: string },
  writer: LoadoutWriter & Pick<LcuImporter, "close">,
  config: Pick<LoadedConfig, "explain" | "engine">,
  pageKey?: string,
): Promise<ImportLine[]> {
  const failures = new Set<string>();
  const say = (id: string, slots: Record<string, string | number> = {}) => {
    const text = renderReason({ id, slots }, config.explain.templates, String);
    if (id.startsWith("import.failed.") || id === "import.runes.full") failures.add(text);
    return text;
  };
  try {
    const page = kind === "items" ? shown.loadout.page : pageToImport(shown.loadout, pageKey);
    if (page === undefined) return [{ text: say("import.runes.stale"), failed: true }];
    const chosen = { ...shown, loadout: { ...shown.loadout, page } };
    const opts = { say, mapId: Number(config.engine.loadout.items.mapId), report: reportProblem };
    const kinds = kind === "all" ? (["runes", "items"] as const) : [kind];
    const done: string[] = [];
    for (const k of kinds) done.push(...(await importLoadout(k, chosen, writer, opts)));
    return done.length ? done.map((text) => ({ text, failed: failures.has(text) })) : [{ text: say("import.nothing"), failed: true }];
  } finally {
    writer.close();
  }
}
