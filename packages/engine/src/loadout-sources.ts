import type { ChampionBuild, ChampionId, ItemSlotStat, OptionStat, Position, RunePageStat, UserMatch } from "@ldc/shared";


function mergeOptions<T extends OptionStat>(lists: T[][], key: (o: T) => string): T[] {
  const map = new Map<string, T>();
  for (const o of lists.flat()) {
    const k = key(o);
    const cur = map.get(k);
    map.set(k, cur ? { ...cur, games: cur.games + o.games, wins: cur.wins + o.wins, n: cur.n + o.n } : { ...o });
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.games - a.games);
}

const pageKey = (p: RunePageStat) => `${p.primaryStyle}|${p.subStyle}|${p.runes.join(",")}|${p.statPerks.join(",")}`;

/**
 * A champion's builds in every role added together (partial pooling's parent group): used
 * when the build in your role rests on too few games. Lifts and matchup pages come from the
 * biggest role only (they are role-specific); the role is the first build's.
 */
export function mergeBuilds(builds: ChampionBuild[]): ChampionBuild | null {
  if (!builds.length) return null;
  if (builds.length === 1) return builds[0]!;
  const biggest = [...builds].sort((a, b) => b.n - a.n)[0]!;
  // Purchases per slot in each build (n / share), to recompute shares over the merged games.
  const slotGames = new Map<number, number>();
  const items = new Map<string, ItemSlotStat & { waSum: number; minSum: number }>();
  for (const b of builds) {
    const perSlot = new Map<number, number>();
    for (const s of b.items) perSlot.set(s.slot, Math.max(perSlot.get(s.slot) ?? 0, s.share > 0 ? s.n / s.share : s.n));
    for (const [slot, g] of perSlot) slotGames.set(slot, (slotGames.get(slot) ?? 0) + g);
    for (const s of b.items) {
      const k = `${s.itemId}|${s.slot}`;
      const cur = items.get(k) ?? { ...s, n: 0, waSum: 0, minSum: 0 };
      cur.n += s.n;
      cur.waSum += s.winAdded * s.n;
      cur.minSum += s.minute * s.n;
      items.set(k, cur);
    }
  }
  return {
    championId: builds[0]!.championId,
    role: builds[0]!.role,
    n: builds.reduce((s, b) => s + b.n, 0),
    timelineN: builds.reduce((s, b) => s + b.timelineN, 0),
    games: builds.reduce((s, b) => s + b.games, 0),
    wins: builds.reduce((s, b) => s + b.wins, 0),
    pages: mergeOptions(builds.map((b) => b.pages), pageKey),
    spells: mergeOptions(builds.map((b) => b.spells), (o) => o.spells.join(",")),
    skills: mergeOptions(builds.map((b) => b.skills), (o) => `${o.first.join("")}|${o.order.join("")}`),
    starting: mergeOptions(builds.map((b) => b.starting), (o) => o.items.join(",")),
    core: mergeOptions(builds.map((b) => b.core), (o) => o.items.join(",")),
    items: [...items.values()].map(({ waSum, minSum, ...s }) => ({
      ...s,
      share: s.n / Math.max(s.n, slotGames.get(s.slot) ?? s.n),
      winAdded: waSum / s.n,
      minute: minSum / s.n,
    })),
    lifts: biggest.lifts,
    matchupPages: biggest.matchupPages,
  };
}

/** What you yourself take on a champion, from your own synced games (no timelines: no order). */
export interface PersonalBuild {
  championId: ChampionId;
  /** Your games on the champion (in the role when it was given and you played it there). */
  n: number;
  pages: RunePageStat[];
  spells: (OptionStat & { spells: number[] })[];
  /** Completed items in your final inventories, most often first. */
  items: { itemId: number; n: number }[];
  /** Every item in your final inventories (quest rewards and upgraded boots included), most often first. */
  held?: { itemId: number; n: number }[];
}

/**
 * Your own rune pages, summoner spells and finished items on a champion, from your match
 * history (only your own participant). In the role when you have games there, else all roles.
 */
export function personalBuild(matches: UserMatch[], championId: ChampionId, role: Position | null, completed: ReadonlySet<number>): PersonalBuild | null {
  const mine = matches.map((m) => m.match.participants[m.me]).filter((p): p is NonNullable<typeof p> => p !== undefined && p.championId === championId);
  const inRole = role ? mine.filter((p) => p.position === role) : [];
  const games = inRole.length ? inRole : mine;
  if (!games.length) return null;
  const pages = new Map<string, RunePageStat>();
  const spells = new Map<string, OptionStat & { spells: number[] }>();
  const items = new Map<number, number>();
  const held = new Map<number, number>();
  for (const p of games) {
    for (const id of new Set(p.items.filter((x) => x > 0))) held.set(id, (held.get(id) ?? 0) + 1);
    const w = p.win ? 1 : 0;
    if (p.perks?.runes.length) {
      const page: RunePageStat = { primaryStyle: p.perks.primaryStyle, subStyle: p.perks.subStyle, runes: p.perks.runes, statPerks: p.perks.statPerks, games: 0, wins: 0, n: 0 };
      const k = pageKey(page);
      const cur = pages.get(k) ?? page;
      pages.set(k, { ...cur, games: cur.games + 1, wins: cur.wins + w, n: cur.n + 1 });
    }
    const s = p.spells.filter((x) => x > 0).sort((a, b) => a - b);
    if (s.length === 2) {
      const k = s.join(",");
      const cur = spells.get(k) ?? { spells: s, games: 0, wins: 0, n: 0 };
      spells.set(k, { ...cur, games: cur.games + 1, wins: cur.wins + w, n: cur.n + 1 });
    }
    for (const id of new Set(p.items.filter((x) => completed.has(x)))) items.set(id, (items.get(id) ?? 0) + 1);
  }
  const byN = <T extends { n: number }>(xs: Iterable<T>) => [...xs].sort((a, b) => b.n - a.n);
  return {
    championId,
    n: games.length,
    pages: byN(pages.values()),
    spells: byN(spells.values()),
    items: byN([...items].map(([itemId, n]) => ({ itemId, n }))),
    held: byN([...held].map(([itemId, n]) => ({ itemId, n }))),
  };
}
