import type { ChampionAttributes, ChampionId, EnemyTrait, ItemInfo } from "@ldc/shared";

/** Which items count as completed (config `items`): on this map, buyable, and expensive enough. */
export interface ItemRules {
  /** Riot map id the build is for (Summoner's Rift). */
  mapId: string;
  /** A completed item that builds into nothing costs at least this much (boots are counted separately). */
  legendaryMinGold: number;
}

const isBoots = (item: ItemInfo) => item.tags.includes("Boots");

/**
 * A completed item, derived from Data Dragon (never listed): a buyable item on the map
 * that builds into nothing (or only into champion-only upgrades) and costs at least
 * `legendaryMinGold`; or upgraded boots (boots built from basic boots, not from other
 * upgraded boots).
 */
export function isCompletedItem(item: ItemInfo, catalog: ReadonlyMap<number, ItemInfo>, rules: ItemRules): boolean {
  if (!item.maps.includes(rules.mapId) || !item.purchasable || item.requiredChampion) return false;
  if (isBoots(item)) {
    if (!item.from.length) return false;
    return !item.from.some((id) => {
      const c = catalog.get(id);
      return c !== undefined && isBoots(c) && c.from.length > 0;
    });
  }
  const upgrades = item.into.filter((id) => !catalog.get(id)?.requiredChampion);
  return upgrades.length === 0 && item.gold >= rules.legendaryMinGold;
}

/** Completed boots: upgraded boots from Data Dragon (its "Boots" tag); they get their own row in the loadout. */
export function completedBoots(catalog: ReadonlyMap<number, ItemInfo>, rules: ItemRules): Set<number> {
  return new Set([...completedItems(catalog, rules)].filter((id) => isBoots(catalog.get(id)!)));
}

export function completedItems(catalog: ReadonlyMap<number, ItemInfo>, rules: ItemRules): Set<number> {
  return new Set([...catalog.values()].filter((i) => isCompletedItem(i, catalog, rules)).map((i) => i.id));
}

export const ENEMY_TRAITS: readonly EnemyTrait[] = ["magic", "physical", "frontline", "engage", "heal"];

/** A champion's measured value for a trait (damage shares, or percentiles among champions). */
export function traitValue(a: ChampionAttributes, trait: EnemyTrait): number | undefined {
  switch (trait) {
    case "magic":
      return a.magicShare;
    case "physical":
      return a.physicalShare;
    case "frontline":
      return a.frontline;
    case "engage":
      return a.engage;
    case "heal":
      return a.heal;
  }
}

/**
 * The enemy team's traits: the (weighted) mean over the champions with measured attributes.
 * `weight` lets your lane opponent count more than the others.
 */
export function teamTraits(
  champions: ChampionId[],
  attributes: ReadonlyMap<ChampionId, ChampionAttributes>,
  weight: (id: ChampionId) => number = () => 1,
): Partial<Record<EnemyTrait, number>> {
  const out: Partial<Record<EnemyTrait, number>> = {};
  for (const t of ENEMY_TRAITS) {
    let sum = 0;
    let w = 0;
    for (const id of champions) {
      const a = attributes.get(id);
      const v = a ? traitValue(a, t) : undefined;
      if (v === undefined) continue;
      sum += v * weight(id);
      w += weight(id);
    }
    if (w > 0) out[t] = sum / w;
  }
  return out;
}

/**
 * Whether players in a role buy an item (its share of games in that role, from the band's
 * data): keeps role-locked items such as jungle companions or support quest items out of
 * other roles. Items without data pass.
 */
export function itemFitsRole(itemId: number, role: string, itemRoles: Record<string, Record<string, number>> | undefined, minShare: number): boolean {
  const roles = itemRoles?.[String(itemId)];
  if (!roles || !role) return true;
  return (roles[role] ?? 0) >= minShare;
}

/**
 * The band's average trait value per player (weighted by games played), the cut above
 * which an enemy team counts as high in a trait.
 */
export function traitCutsFrom(
  champions: { championId: ChampionId; games: number }[],
  attributes: ReadonlyMap<ChampionId, ChampionAttributes>,
): Record<EnemyTrait, number> {
  const out = {} as Record<EnemyTrait, number>;
  for (const t of ENEMY_TRAITS) {
    let sum = 0;
    let w = 0;
    for (const c of champions) {
      const a = attributes.get(c.championId);
      const v = a ? traitValue(a, t) : undefined;
      if (v === undefined) continue;
      sum += v * c.games;
      w += c.games;
    }
    out[t] = w ? sum / w : 0.5;
  }
  return out;
}
