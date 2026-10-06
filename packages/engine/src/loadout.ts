import type { ChampionAttributes, ChampionBuild, ChampionId, EnemyTrait, ItemSlotStat, OptionStat, Reason, RunePageStat, SituationalLift } from "@ldc/shared";
import type { LoadoutConfig } from "./config";
import { reason } from "./explain";
import { ENEMY_TRAITS, itemFitsRole, teamTraits } from "./items";
import type { PersonalBuild } from "./loadout-sources";

/** What the loadout is for: your champion and role, and what the draft shows of the enemy team. */
export interface LoadoutInput {
  build: ChampionBuild;
  /** Enemy champions picked (or hovered) so far. */
  enemies: ChampionId[];
  /** The enemy in your lane, when known. */
  laneOpponent: ChampionId | null;
  attributes: ReadonlyMap<ChampionId, ChampionAttributes>;
  traitCuts: Record<EnemyTrait, number>;
  config: LoadoutConfig;
  /** Items you already own (M8, live); empty before the game. */
  owned?: number[];
  /** The champion's builds in all roles added together, used when your role's build has too few games. */
  pooled?: ChampionBuild | null;
  /** What you yourself take on the champion (your own games), preferred when the band's data is thin. */
  personal?: PersonalBuild | null;
  /** Thin data: item reasons quote how often players buy the item, not its (noisy) win added. */
  thin?: boolean;
  /** Which roles buy each item (snapshot `itemRoles`), to keep role-locked items in their role. */
  itemRoles?: Record<string, Record<string, number>>;
  /** Completed boots (from Data Dragon): chosen on their own row, left out of the item slots. */
  boots?: ReadonlySet<number>;
  /** Your role's quest rewards (snapshot `roleRewards`), and Data Dragon's build paths to link them to your items. */
  roleRewards?: { itemId: number; share: number }[];
  buildsFrom?: (itemId: number) => number[];
}

/** Whether `item` is built (directly or further up the path) from `base`, per Data Dragon. */
function builtFrom(item: number, base: number, from: (id: number) => number[], depth = 4): boolean {
  if (depth <= 0) return false;
  const parts = from(item);
  return parts.includes(base) || parts.some((p) => builtFrom(p, base, from, depth - 1));
}

/** Enemy traits with your lane opponent counted `laneWeight` times. */
function enemyTraits(input: LoadoutInput) {
  const lane = input.laneOpponent;
  return teamTraits(input.enemies, input.attributes, (id) => (id === lane ? input.config.laneWeight : 1));
}

/**
 * Items players in your role actually buy: role-locked items of other roles are left out, and
 * so are your role's quest rewards (you get those, you don't buy them).
 */
const fits = (input: LoadoutInput, itemId: number) =>
  itemFitsRole(itemId, input.build.role, input.itemRoles, input.config.minItemRoleShare) && !input.roleRewards?.some((r) => r.itemId === itemId);

/** Where the loadout's numbers come from, for the "rough guide" note. */
export interface LoadoutSource {
  /** Games behind the band data used (your role, or all roles when pooled). */
  games: number;
  /** Games in your role alone. */
  roleGames: number;
  /** True when your role had too few games and the champion's other roles filled in. */
  pooled: boolean;
  /** Your own games on the champion that were used (0 = none). */
  personalGames: number;
  /** Fewer than `solidGames`: choices are the most taken ones, and win rates aren't shown. */
  thin: boolean;
}

export interface LoadoutChoice<T> {
  value: T;
  winRate: number;
  n: number;
  reasons: Reason[];
}

/** One item's score at a build slot, in rating points, and why. */
export interface RankedItem {
  itemId: number;
  slot: number;
  /** Rating points: win added at the slot plus situational need. */
  score: number;
  winAdded: number;
  /** Rating points from situational lift against this enemy team. */
  situational: number;
  n: number;
  share: number;
  reasons: Reason[];
}

export interface ItemSlotAdvice {
  slot: number;
  top: RankedItem;
  alternatives: RankedItem[];
}

export interface Loadout {
  championId: ChampionId;
  role: string;
  /** Games behind the build (band plus the band above). */
  games: number;
  source: LoadoutSource;
  page: LoadoutChoice<RunePageStat> | null;
  /** Runes worth a look against this enemy team (lift), with the reason. */
  situationalRunes: { runeId: number; reasons: Reason[] }[];
  spells: LoadoutChoice<number[]> | null;
  skills: LoadoutChoice<{ first: number[]; order: number[] }> | null;
  starting: LoadoutChoice<number[]> | null;
  /** Boots, chosen on their own (any build slot), with up to `alternatives` other boots. */
  boots: { top: RankedItem; alternatives: RankedItem[] } | null;
  /** What your role quest turns items of this loadout into (boots, starting items), from data. */
  quest: { itemId: number; from: number; reasons: Reason[] }[];
  /**
   * Thin data: after the core items, a pool of good later items to pick from by situation (your
   * own other finished items, what your lane buys later), each with its reason. Empty with solid data.
   */
  laterPool: { itemId: number; reasons: Reason[] }[];
  /** Items players in your role buy more often against teams like this one (lift), with the trait they answer. */
  situational: { itemId: number; trait: EnemyTrait; reasons: Reason[] }[];
  /** The build path: the top item per slot, or the most common path when purchases are too few to rank. */
  core: LoadoutChoice<number[]> | null;
  items: ItemSlotAdvice[];
}

const winRate = (o: OptionStat) => (o.games > 0 ? o.wins / o.games : 0);

/**
 * The most successful common option: among options taken in at least `minShare` of the
 * champion-role's games (and `minGames` games), the highest win rate smoothed toward the
 * champion-role's own win rate with `priorGames`.
 */
export function bestOption<T extends OptionStat>(options: T[], build: ChampionBuild, cfg: LoadoutConfig): T | null {
  const base = build.games > 0 ? build.wins / build.games : 0.5;
  const ok = options.filter((o) => o.n >= cfg.minGames && o.n / build.n >= cfg.minShare);
  if (!ok.length) return null;
  const smoothed = (o: T) => (o.wins + cfg.priorGames * base) / (o.games + cfg.priorGames);
  return ok.reduce((best, o) => (smoothed(o) > smoothed(best) ? o : best));
}

/**
 * How much the enemy team is above the band in a trait, 0..1: 0 at or below the band's
 * average, 1 at the most extreme value.
 */
export function traitIntensity(value: number | undefined, cut: number): number {
  if (value === undefined || value <= cut) return 0;
  return Math.min(1, (value - cut) / Math.max(1e-6, 1 - cut));
}

function choice<T extends OptionStat, V>(o: T | null, value: (o: T) => V, why: (o: T) => Reason[]): LoadoutChoice<V> | null {
  return o ? { value: value(o), winRate: winRate(o), n: o.n, reasons: why(o) } : null;
}

/** Reason for a lift against the enemy team, e.g. "taken 2.4× more vs magic-heavy teams; theirs is 68% magic". */
function liftReason(kind: "rune" | "item", l: SituationalLift, enemy: Partial<Record<EnemyTrait, number>>): Reason {
  return reason(`loadout.${kind}.lift.${l.trait}`, { id: l.id, lift: l.lift.toFixed(1), value: enemy[l.trait] ?? 0, games: l.n });
}

/**
 * Ranks the items for each build slot (DESIGN.md "Item ranking"; pure). In M6 the state is
 * the draft: score = win added at the slot (in rating points) + Σ lift × how far the enemy
 * team is above the band in the trait. Candidates are items bought at that slot by at least
 * `itemMinShare` of the champion-role, so advice stays inside builds real players use. An
 * item whose win added is below `negativeGuard` is never the top pick. Slot k's top pick is
 * left out of later slots.
 */
export function rankItems(input: LoadoutInput): ItemSlotAdvice[] {
  const taken = new Set(input.owned ?? []);
  const out: ItemSlotAdvice[] = [];
  for (let slot = 1; slot <= input.config.slots; slot++) {
    const ranked = rankSlot(input, slot, taken);
    const [top, ...rest] = ranked;
    if (!top) continue;
    taken.add(top.itemId);
    out.push({ slot, top, alternatives: rest.slice(0, input.config.alternatives) });
  }
  return out;
}

/** All candidates for one build slot, best first (see rankItems); `exclude` holds items already owned or chosen. */
export function rankSlot(input: LoadoutInput, slot: number, exclude: ReadonlySet<number>): RankedItem[] {
  const { build, config: cfg } = input;
  const enemy = enemyTraits(input);
  // Into your lane opponent: how much more often each item is the first one finished (smoothed toward its usual share).
  const vs = slot === 1 && input.laneOpponent !== null ? build.matchupItems?.find((m) => m.enemy === input.laneOpponent && m.games >= cfg.minMatchupGames) : undefined;
  const intensity = Object.fromEntries(ENEMY_TRAITS.map((t) => [t, traitIntensity(enemy[t], input.traitCuts[t])])) as Record<EnemyTrait, number>;
  const lifts = build.lifts.filter((l) => l.kind === "item");
  return build.items
    .filter((s) => s.slot === slot && s.share >= cfg.itemMinShare && !exclude.has(s.itemId) && !input.boots?.has(s.itemId) && fits(input, s.itemId))
    .map((s: ItemSlotStat): RankedItem => {
      const mine = lifts.filter((l) => l.id === s.itemId && intensity[l.trait] > 0);
      let situational = mine.reduce((sum, l) => sum + cfg.liftScale * Math.log(l.lift) * intensity[l.trait], 0);
      const reasons: Reason[] = [];
      if (vs) {
        const count = vs.first.find((f) => f.itemId === s.itemId)?.n ?? 0;
        const k = cfg.minMatchupGames;
        const lift = (count + k * s.share) / (vs.games + k) / s.share;
        situational += cfg.liftScale * Math.log(lift);
        if (lift >= cfg.minLift) reasons.push(reason("loadout.item.matchup", { enemy: vs.enemy, lift: lift.toFixed(1), count, games: vs.games }));
      }
      const best = [...mine].sort((a, b) => Math.log(b.lift) * intensity[b.trait] - Math.log(a.lift) * intensity[a.trait])[0];
      if (best) reasons.push(liftReason("item", best, enemy));
      reasons.push(
        input.thin
          ? reason("loadout.item.popular", { id: s.itemId, slot, share: s.share, games: s.n })
          : reason(s.winAdded >= 0 ? "loadout.item.winAdded" : "loadout.item.winAdded.negative", { id: s.itemId, slot, delta: s.winAdded, share: s.share, games: s.n }),
      );
      return { itemId: s.itemId, slot, score: cfg.winAddedScale * s.winAdded + cfg.shareScale * Math.log(s.share) + situational, winAdded: s.winAdded, situational, n: s.n, share: s.share, reasons };
    })
    .sort((a, b) => Number(b.winAdded >= cfg.negativeGuard) - Number(a.winAdded >= cfg.negativeGuard) || b.score - a.score);
}

/**
 * Situational items against this enemy team: items your role buys more often when the enemy
 * team is high in a trait (lift), for traits this team is above the band in (your lane
 * opponent counts more). Not boots, not items already on the build path; strongest need first.
 */
export function situationalItems(input: LoadoutInput, exclude: ReadonlySet<number>): Loadout["situational"] {
  const { build, config: cfg } = input;
  const enemy = enemyTraits(input);
  const intensity = Object.fromEntries(ENEMY_TRAITS.map((t) => [t, traitIntensity(enemy[t], input.traitCuts[t])])) as Record<EnemyTrait, number>;
  const best = new Map<number, SituationalLift & { score: number }>();
  for (const l of build.lifts) {
    if (l.kind !== "item" || l.lift < cfg.minLift || intensity[l.trait] <= 0) continue;
    if (exclude.has(l.id) || input.boots?.has(l.id) || !fits(input, l.id)) continue;
    const score = Math.log(l.lift) * intensity[l.trait];
    if (score > (best.get(l.id)?.score ?? 0)) best.set(l.id, { ...l, score });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxSituational)
    .map((l) => ({ itemId: l.id, trait: l.trait, reasons: [liftReason("item", l, enemy)] }));
}

/** Your role's quest rewards that come from items in the loadout (most common first, one per item). */
function questRewards(input: LoadoutInput, items: number[]): Loadout["quest"] {
  const from = input.buildsFrom;
  if (!from || !input.roleRewards?.length) return [];
  const out: Loadout["quest"] = [];
  for (const base of new Set(items)) {
    const r = input.roleRewards.find((x) => x.itemId !== base && builtFrom(x.itemId, base, from));
    if (r && !out.some((q) => q.itemId === r.itemId)) {
      out.push({ itemId: r.itemId, from: base, reasons: [reason("loadout.quest", { item: r.itemId, from: base, role: input.build.role, share: r.share })] });
    }
  }
  return out;
}

/**
 * Boots on their own row: every completed boots item bought by your role in any build slot,
 * scored like a slot (popularity prior, win added, lift against this enemy team with your
 * lane opponent counted more). Thin data: reasons quote how often players buy them.
 */
export function rankBoots(input: LoadoutInput): { top: RankedItem; alternatives: RankedItem[] } | null {
  const { build, config: cfg } = input;
  const boots = input.boots;
  if (!boots?.size) return null;
  const thin = build.n < cfg.solidGames;
  const enemy = enemyTraits(input);
  const intensity = Object.fromEntries(ENEMY_TRAITS.map((t) => [t, traitIntensity(enemy[t], input.traitCuts[t])])) as Record<EnemyTrait, number>;
  const byItem = new Map<number, { n: number; wa: number }>();
  for (const s of build.items) {
    if (!boots.has(s.itemId) || !fits(input, s.itemId)) continue;
    const cur = byItem.get(s.itemId) ?? { n: 0, wa: 0 };
    cur.n += s.n;
    cur.wa += s.winAdded * s.n;
    byItem.set(s.itemId, cur);
  }
  const total = [...byItem.values()].reduce((a, b) => a + b.n, 0);
  if (!total) return null;
  const ranked = [...byItem].map(([itemId, x]): RankedItem => {
    const share = x.n / total;
    const winAdded = x.wa / x.n;
    const mine = build.lifts.filter((l) => l.kind === "item" && l.id === itemId && intensity[l.trait] > 0);
    const situational = mine.reduce((sum, l) => sum + cfg.liftScale * Math.log(l.lift) * intensity[l.trait], 0);
    const best = [...mine].sort((a, b) => Math.log(b.lift) * intensity[b.trait] - Math.log(a.lift) * intensity[a.trait])[0];
    const reasons: Reason[] = [];
    if (best) reasons.push(liftReason("item", best, enemy));
    reasons.push(reason(thin ? "loadout.boots.popular" : "loadout.boots", { share, games: x.n, delta: winAdded }));
    return { itemId, slot: 0, score: cfg.shareScale * Math.log(share) + (thin ? 0 : cfg.winAddedScale * winAdded) + situational, winAdded, situational, n: x.n, share, reasons };
  });
  ranked.sort((a, b) => b.score - a.score);
  const [top, ...rest] = ranked;
  return top ? { top, alternatives: rest.slice(0, cfg.alternatives) } : null;
}

/**
 * The loadout for a locked-in (or hovered) champion: rune page (into the lane opponent when
 * that matchup is common enough), situational runes, summoner spells, skill order, starting
 * items, core path and ranked items per slot. Everything comes from the band's builds
 * (band plus the band above); every number in a reason comes from those builds.
 */
export function buildLoadout(input: LoadoutInput): Loadout {
  const { config: cfg } = input;
  const roleBuild = input.build;
  const enemy = enemyTraits(input);
  // Small samples (partial pooling): too few games in your role, so the champion in all roles.
  // Only for runes and skill order (same champion, same kit); items and starting items depend
  // on the lane, so they always come from your role (or your own games in it).
  const pooled = roleBuild.n < cfg.solidGames && input.pooled && input.pooled.n > roleBuild.n ? input.pooled : null;
  const build = pooled ?? roleBuild;
  const thin = build.n < cfg.solidGames;
  // With thin band data, your own games on the champion come first (comfort first).
  const personal = thin && input.personal && input.personal.n >= cfg.personalMinGames ? input.personal : null;
  let personalUsed = false;
  const champion = roleBuild.championId;
  /** Thin data: the most taken option (win rates from a handful of games are noise); else the best common one. */
  const pick = <T extends OptionStat>(list: T[], b: ChampionBuild) => (thin ? (list[0] ?? null) : bestOption(list, b, cfg));

  const matchup = !thin && input.laneOpponent !== null ? build.matchupPages.find((p) => p.enemy === input.laneOpponent && p.n >= cfg.minMatchupGames) : undefined;
  const pageValue = (p: RunePageStat) => ({ primaryStyle: p.primaryStyle, subStyle: p.subStyle, runes: p.runes, statPerks: p.statPerks, games: p.games, wins: p.wins, n: p.n });
  let page: LoadoutChoice<RunePageStat> | null;
  if (personal?.pages[0]) {
    personalUsed = true;
    page = choice(personal.pages[0], pageValue, (p) => [reason("loadout.page.personal", { count: p.n, games: personal.n, champion })]);
  } else {
    page = choice(matchup ?? pick(build.pages, build), pageValue, (p) => [
      matchup
        ? reason("loadout.page.matchup", { enemy: matchup.enemy, winRate: winRate(p), games: p.n })
        : thin
          ? reason("loadout.page.popular", { count: p.n, games: build.n })
          : reason("loadout.page", { winRate: winRate(p), games: p.n, share: p.n / build.n }),
    ]);
  }

  // Runes taken more often against teams like this one, and not already on the page.
  const onPage = new Set(page?.value.runes ?? []);
  const seen = new Set<number>();
  const situationalRunes = build.lifts
    .filter((l) => l.kind === "rune" && l.lift >= cfg.minLift && !onPage.has(l.id) && traitIntensity(enemy[l.trait], input.traitCuts[l.trait]) > 0)
    .sort((a, b) => b.lift - a.lift)
    .filter((l) => !seen.has(l.id) && seen.add(l.id))
    .slice(0, cfg.maxSituational)
    .map((l) => ({ runeId: l.id, reasons: [liftReason("rune", l, enemy)] }));

  // Spells depend on the role (Smite in the jungle), so they never come from other roles.
  let spells: LoadoutChoice<number[]> | null;
  if (personal?.spells[0]) {
    personalUsed = true;
    spells = choice(personal.spells[0], (o) => o.spells, (o) => [reason("loadout.spells.personal", { count: o.n, games: personal.n, champion })]);
  } else {
    const roleThin = roleBuild.n < cfg.solidGames;
    const o = roleThin ? (roleBuild.spells[0] ?? null) : bestOption(roleBuild.spells, roleBuild, cfg);
    spells = choice(o, (x) => x.spells, (x) =>
      roleThin ? [reason("loadout.spells.popular", { count: x.n, games: roleBuild.n })] : [reason("loadout.spells", { winRate: winRate(x), games: x.n, share: x.n / roleBuild.n })],
    );
  }
  // Skill order and starting items: the most common choice (taken by most players), not the best win rate.
  const common = <T extends OptionStat>(list: T[]) => list.find((o) => o.n >= (thin ? 1 : cfg.minGames)) ?? null;
  const timelineShare = (o: OptionStat) => o.n / Math.max(1, build.timelineN);
  const skills = choice(common(build.skills), (o) => ({ first: o.first, order: o.order }), (o) => [reason("loadout.skills", { share: timelineShare(o), games: o.n })]);
  const laneStart =
    input.laneOpponent !== null ? roleBuild.matchupItems?.find((m) => m.enemy === input.laneOpponent && m.games >= cfg.minMatchupGames && m.starting) : undefined;
  const roleTimeline = (o: OptionStat) => o.n / Math.max(1, roleBuild.timelineN);
  const starting = laneStart?.starting
    ? { value: laneStart.starting.items, winRate: 0, n: laneStart.starting.n, reasons: [reason("loadout.starting.matchup", { enemy: laneStart.enemy, count: laneStart.starting.n, games: laneStart.games })] }
    : choice(
        roleBuild.starting.find((o) => o.n >= (thin ? 1 : cfg.minGames) && o.items.every((id) => fits(input, id))) ?? null,
        (o) => o.items,
        (o) => [reason("loadout.starting", { share: roleTimeline(o), games: o.n })],
      );
  // Items come from win added and lift (rankItems), never raw win rate. Without enough
  // purchases for that, the most common path is shown as what players build.
  // Thin band data and more of your own games on the champion than the band's timelines: your own finished items.
  const ownItems = personal ? personal.items.filter((i) => fits(input, i.itemId) && !input.boots?.has(i.itemId)) : [];
  // Boots: your role's purchases; with thin data and more of your own games, your usual boots.
  // Your final inventories hold quest-upgraded boots (e.g. tier 3 in mid): count them as the boots they came from.
  const ownBootCounts = new Map<number, number>();
  for (const i of personal?.held ?? personal?.items ?? []) {
    const base = input.boots?.has(i.itemId)
      ? i.itemId
      : input.roleRewards?.some((r) => r.itemId === i.itemId) && input.buildsFrom
        ? [...(input.boots ?? [])].find((b) => builtFrom(i.itemId, b, input.buildsFrom!))
        : undefined;
    if (base !== undefined && fits(input, base)) ownBootCounts.set(base, (ownBootCounts.get(base) ?? 0) + i.n);
  }
  const ownBoots = [...ownBootCounts].map(([itemId, n]) => ({ itemId, n })).sort((a, b) => b.n - a.n);
  let boots = rankBoots({ ...input, build: roleBuild });
  if (personal && ownBoots[0] && (!boots || personal.n > boots.top.n)) {
    personalUsed = true;
    const b = ownBoots[0];
    boots = {
      top: { itemId: b.itemId, slot: 0, score: 0, winAdded: 0, situational: 0, n: b.n, share: b.n / personal.n, reasons: [reason("loadout.boots.personal", { count: b.n, games: personal.n, champion })] },
      alternatives: [],
    };
  }
  const useOwnItems = personal !== null && ownItems.length >= 2 && personal.n > roleBuild.timelineN;
  const items = useOwnItems ? [] : rankItems({ ...input, build: roleBuild, thin: roleBuild.n < cfg.solidGames });
  const roleCommon = <T extends OptionStat & { items: number[] }>(list: T[]) => list.find((o) => o.n >= (thin ? 1 : cfg.minGames) && o.items.every((id) => fits(input, id))) ?? null;
  const commonPath = roleCommon(roleBuild.core.filter((c) => c.items.length >= 3)) ?? roleCommon(roleBuild.core);
  let core: LoadoutChoice<number[]> | null;
  if (useOwnItems) {
    personalUsed = true;
    core = { value: ownItems.slice(0, cfg.slots).map((i) => i.itemId), winRate: 0, n: personal!.n, reasons: [reason("loadout.core.personal", { games: personal!.n, champion })] };
  } else if (items.length) core = { value: items.map((s) => s.top.itemId), winRate: 0, n: Math.min(...items.map((s) => s.top.n)), reasons: [] };
  else if (commonPath) core = choice(commonPath, (o) => o.items, (o) => [reason("loadout.core.common", { share: roleTimeline(o), games: o.n })]);
  else if (input.personal?.items.length) {
    // No band purchases at all: the items you finish most often on the champion.
    personalUsed = true;
    const own = input.personal;
    core = { value: own.items.filter((i) => fits(input, i.itemId)).slice(0, cfg.slots).map((i) => i.itemId), winRate: 0, n: own.n, reasons: [reason("loadout.core.personal", { games: own.n, champion })] };
  } else core = null;

  // Thin data: only the core items are a fixed path; later items are a pool to pick from by
  // situation, since late items are bought in fewer games and depend on the game (owner, 2026-10-06).
  let laterPool: Loadout["laterPool"] = [];
  let shownItems = items;
  if ((useOwnItems || roleBuild.n < cfg.solidGames) && core && core.value.length > cfg.coreSlots) {
    const fixed = core.value.slice(0, cfg.coreSlots);
    const seen = new Set([...fixed, ...(boots ? [boots.top.itemId] : [])]);
    const pool: Loadout["laterPool"] = [];
    const add = (itemId: number, reasons: Reason[]) => {
      if (seen.has(itemId) || input.boots?.has(itemId) || !fits(input, itemId)) return;
      seen.add(itemId);
      pool.push({ itemId, reasons });
    };
    for (const s of items.slice(cfg.coreSlots)) add(s.top.itemId, s.top.reasons);
    const own = personal ?? input.personal;
    for (const i of own?.items ?? []) add(i.itemId, [reason("loadout.later.personal", { count: i.n, games: own!.n, champion })]);
    for (const s of items.slice(cfg.coreSlots)) for (const a of s.alternatives) add(a.itemId, a.reasons);
    for (const s of [...roleBuild.items].filter((x) => x.slot > cfg.coreSlots).sort((a, b) => b.n - a.n)) {
      add(s.itemId, [reason("loadout.item.popular", { slot: s.slot, share: s.share, games: s.n })]);
    }
    laterPool = pool.slice(0, cfg.laterPoolSize);
    core = { ...core, value: fixed };
    shownItems = items.slice(0, cfg.coreSlots);
  }

  return {
    championId: roleBuild.championId,
    role: roleBuild.role,
    games: build.n,
    source: { games: build.n, roleGames: roleBuild.n, pooled: pooled !== null, personalGames: personalUsed ? (input.personal?.n ?? 0) : 0, thin },
    page,
    situationalRunes,
    spells,
    skills,
    starting,
    boots,
    quest: questRewards(input, [...(boots ? [boots.top.itemId] : []), ...(starting?.value ?? [])]),
    situational: situationalItems({ ...input, build: roleBuild }, new Set(core?.value ?? [])),
    laterPool,
    core,
    items: shownItems,
  };
}
