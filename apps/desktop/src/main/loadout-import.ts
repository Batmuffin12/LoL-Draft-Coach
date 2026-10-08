import type { Loadout } from "@ldc/engine";
import { LcuWriteError, type LcuImporter } from "@ldc/lcu";

/** What importing needs from the LCU writer (the single approved LCU write exception, CLAUDE.md). */
export type LoadoutWriter = Pick<LcuImporter, "importRunePage" | "importSpells" | "importItemSet">;

export interface ImportOptions {
  /** Renders an explain template ("import.runes.done", ...). */
  say: (id: string, slots?: Record<string, string | number>) => string;
  /** Data Dragon map id for the item set (Summoner's Rift). */
  mapId: number;
}

/**
 * Writes a shown loadout into the League client and returns what to tell the player:
 * "runes" = the rune page and the two summoner spells (one button; one failing doesn't stop the
 * other), "items" = the item set. Called only from the player's click on an import button.
 */
export async function importLoadout(kind: "runes" | "items", shown: { loadout: Loadout; champion: string }, writer: LoadoutWriter, opts: ImportOptions): Promise<string> {
  const { say } = opts;
  const failure = (err: unknown) => (err instanceof LcuWriteError && err.reason === "pagesFull" ? say("import.runes.full") : say("import.failed", { error: (err as Error).message }));
  const l = shown.loadout;
  try {
    if (kind === "runes") {
      const done: string[] = [];
      if (l.page) {
        const p = l.page.value;
        // Stored shards are in Riot's match order (defense, flex, offense); the client wants offense, flex, defense.
        await writer
          .importRunePage({ name: shown.champion, primaryStyleId: p.primaryStyle, subStyleId: p.subStyle, selectedPerkIds: [...p.runes, ...[...p.statPerks].reverse()] })
          .then((result) => done.push(say(`import.runes.${result}`)), (err: unknown) => done.push(failure(err)));
      }
      const s = l.spells?.value;
      if (s?.length === 2) await writer.importSpells([s[0]!, s[1]!]).then(() => done.push(say("import.spells.done")), (err: unknown) => done.push(failure(err)));
      return done.join(" · ");
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
    await writer.importItemSet({ title: `${shown.champion} ${l.role}`, championId: l.championId, mapId: opts.mapId, blocks });
    return say("import.items.done");
  } catch (err) {
    return failure(err);
  }
}
