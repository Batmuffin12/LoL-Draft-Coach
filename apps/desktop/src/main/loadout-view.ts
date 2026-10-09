import type { StaticData } from "@ldc/ddragon";
import { renderReason, type Loadout, type LoadoutChoice, type RankBandConfig, type RankedItem } from "@ldc/engine";
import type { ChampionId, Reason, RankBandId } from "@ldc/shared";
import type { ChoiceNumbers, IconView, ItemOptionView, LoadoutItemView, LoadoutView, RuneTreeView } from "../shared/view";

export interface LoadoutViewDeps {
  data: StaticData | null;
  templates: Record<string, string>;
  championName: (id: ChampionId) => string;
  bands: RankBandConfig;
  band: RankBandId;
  canImport: boolean;
  /** Stat shard names and icons (from the client's perks list), when known. */
  perk?: (id: number) => { name: string; iconUrl: string | null } | undefined;
  /** The stat shard rows as the client lists them (offense, flex, defense), when known. */
  shardRows?: number[][];
}

/** A rune path whole, from Data Dragon's runesReforged; `skipKeystones` for the secondary path. Null when the path is unknown. */
export function runeTree(data: StaticData | null, styleId: number, skipKeystones: boolean): RuneTreeView | null {
  const style = data?.runes.find((s) => s.id === styleId);
  if (!style || !data) return null;
  const icon = (id: number): IconView => {
    const r = data.runeInfo.get(id);
    return { id, name: r?.name ?? `#${id}`, iconUrl: r?.iconUrl ?? null };
  };
  return { style: icon(style.id), rows: style.slots.slice(skipKeystones ? 1 : 0).map((s) => s.runes.map((r) => icon(r.id))) };
}

/** The shard rows with names and icons, and which one of each row is chosen (`chosen` in the client's order). */
export function shardRowsView(rows: number[][], chosen: number[], perk: LoadoutViewDeps["perk"]): { rows: IconView[][]; chosen: number[] } | null {
  if (!rows.length) return null;
  const icon = (id: number): IconView => {
    const p = perk?.(id);
    return { id, name: p?.name ?? `#${id}`, iconUrl: p?.iconUrl ?? null };
  };
  return { rows: rows.map((r) => r.map(icon)), chosen: rows.map((r, i) => (chosen[i] === undefined ? -1 : r.indexOf(chosen[i]!))) };
}

/** Repeated ids once, with how many: [1055, 2003, 2003] → items [1055, 2003], counts [1, 2]. */
export function groupRepeats(ids: number[]): { ids: number[]; counts: number[] } {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return { ids: [...counts.keys()], counts: [...counts.values()] };
}

/** Builds what the "Your pick" card shows from an engine loadout: Data Dragon names and icons, reasons in words. */
export function toLoadoutView(l: Loadout, deps: LoadoutViewDeps): LoadoutView {
  const d = deps.data;
  const icon = (map: ReadonlyMap<number, { name: string; iconUrl: string }> | undefined, id: number): IconView => {
    const x = map?.get(id);
    return { id, name: x?.name ?? `#${id}`, iconUrl: x?.iconUrl ?? null };
  };
  const item = (id: number) => icon(d?.itemInfo, id);
  const rune = (id: number) => icon(d?.runeInfo, id);
  const names = { item: (id: number) => item(id).name, rune: (id: number) => rune(id).name };
  const say = (r: Reason) => renderReason(r, deps.templates, deps.championName, names);
  const first = (rs: Reason[]) => (rs[0] ? say(rs[0]) : null);
  const key = (slot: number) => renderReason({ id: `skill.key.${slot}`, slots: {} }, deps.templates, deps.championName);
  const withReasons = (v: IconView, rs: Reason[]): LoadoutItemView => ({ ...v, reasons: rs.map(say) });
  const thin = l.source.thin;
  /** Win rate and games of a choice; no win rate with thin data (D31) or when the choice has none (0: e.g. the start into your lane opponent). */
  const numbers = (c: LoadoutChoice<unknown>): ChoiceNumbers => ({ winRate: thin || c.winRate <= 0 ? null : c.winRate, games: c.n });
  const option = (r: RankedItem): ItemOptionView => ({ ...withReasons(item(r.itemId), r.reasons), share: r.share, winAdded: thin ? null : r.winAdded });
  // Stored in Riot's match order (defense, flex, offense); shown like the client (offense, flex, defense).
  const shardIds = l.page ? [...l.page.value.statPerks].reverse() : [];
  const start = l.starting ? groupRepeats(l.starting.value) : null;

  const ids = deps.bands.bands.map((b) => b.id).sort((a, b) => a - b);
  const sourceBands = [deps.band, ids[ids.indexOf(deps.band) + 1]].filter((b): b is number => b !== undefined);
  const bandNames = sourceBands.map((b) => deps.bands.bands.find((x) => x.id === b)?.name ?? String(b));
  // Neighbouring bands read as one range: "Gold to Platinum" + "Emerald to Diamond" → "Gold to Diamond".
  const ranges = bandNames.map((n) => /^(.+) to (.+)$/.exec(n));
  const source = bandNames.length > 1 && ranges.every(Boolean) ? `${ranges[0]![1]} to ${ranges.at(-1)![2]}` : bandNames.join(" + ");

  const primaryTree = l.page ? runeTree(d, l.page.value.primaryStyle, false) : null;
  const secondaryTree = l.page ? runeTree(d, l.page.value.subStyle, true) : null;
  // "Swap in" only what fits the shown page: a rune from one of its two trees (another tree is a different page).
  const inTrees = new Set([primaryTree, secondaryTree].flatMap((t) => t?.rows.flat().map((r) => r.id) ?? []));
  return {
    games: l.games,
    source,
    thinNote: l.source.thin
      ? [
          renderReason({ id: l.source.pooled ? "loadout.thin.pooled" : "loadout.thin", slots: { roleGames: l.source.roleGames, games: l.source.games, role: l.role, champion: l.championId } }, deps.templates, deps.championName),
          ...(l.source.personalGames ? [renderReason({ id: "loadout.thin.personal", slots: { personalGames: l.source.personalGames } }, deps.templates, deps.championName)] : []),
        ].join(". ")
      : null,
    page: l.page
      ? {
          primary: rune(l.page.value.primaryStyle),
          secondary: rune(l.page.value.subStyle),
          runes: l.page.value.runes.map(rune),
          shards: shardIds.flatMap((id) => {
            const p = deps.perk?.(id);
            return p ? [{ id, name: p.name, iconUrl: p.iconUrl }] : [];
          }),
          reason: first(l.page.reasons),
          primaryTree,
          secondaryTree,
          shardRows: shardRowsView(deps.shardRows ?? [], shardIds, deps.perk),
          ...numbers(l.page),
        }
      : null,
    situationalRunes: l.situationalRunes.filter((r) => !inTrees.size || inTrees.has(r.runeId)).map((r) => withReasons(rune(r.runeId), r.reasons)),
    spells: l.spells ? { spells: l.spells.value.map((id) => icon(d?.spellInfo, id)), reason: first(l.spells.reasons), ...numbers(l.spells) } : null,
    skills: l.skills ? { first: l.skills.value.first.map(key), order: l.skills.value.order.map(key), basic: [1, 2, 3].map(key), ult: key(4), reason: first(l.skills.reasons), ...numbers(l.skills) } : null,
    starting: l.starting && start ? { items: start.ids.map(item), counts: start.counts, reason: first(l.starting.reasons), ...numbers(l.starting) } : null,
    quest: l.quest.map((q) => withReasons(item(q.itemId), q.reasons)),
    situational: l.situational.map((s) => withReasons(item(s.itemId), s.reasons)),
    laterPool: l.laterPool.map((s) => withReasons(item(s.itemId), s.reasons)),
    laterNote: l.laterPool.length ? renderReason({ id: "loadout.later", slots: {} }, deps.templates, deps.championName) : null,
    boots: l.boots ? { top: option(l.boots.top), alternatives: l.boots.alternatives.map(option) } : null,
    items: l.items.map((s) => ({ slot: s.slot, minute: s.minute > 0 ? s.minute : null, top: option(s.top), alternatives: s.alternatives.map(option) })),
    commonPath: !l.items.length && l.core ? { items: l.core.value.map(item), reason: first(l.core.reasons) } : null,
    canImport: deps.canImport,
  };
}
