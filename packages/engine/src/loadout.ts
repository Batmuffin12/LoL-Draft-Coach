import type { ChampionAttributes, ChampionBuild, ChampionId, EnemyTrait, ItemSlotStat, OptionStat, Reason, RunePageStat, SituationalLift } from "@ldc/shared";
import type { LoadoutConfig } from "./config";
import { reason } from "./explain";
import { ENEMY_TRAITS, teamTraits } from "./items";

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
  page: LoadoutChoice<RunePageStat> | null;
  /** Runes worth a look against this enemy team (lift), with the reason. */
  situationalRunes: { runeId: number; reasons: Reason[] }[];
  spells: LoadoutChoice<number[]> | null;
  skills: LoadoutChoice<{ first: number[]; order: number[] }> | null;
  starting: LoadoutChoice<number[]> | null;
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
  const { build, config: cfg } = input;
  const enemy = teamTraits(input.enemies, input.attributes);
  const intensity = Object.fromEntries(ENEMY_TRAITS.map((t) => [t, traitIntensity(enemy[t], input.traitCuts[t])])) as Record<EnemyTrait, number>;
  const lifts = build.lifts.filter((l) => l.kind === "item");
  const taken = new Set(input.owned ?? []);
  const out: ItemSlotAdvice[] = [];

  for (let slot = 1; slot <= cfg.slots; slot++) {
    const ranked = build.items
      .filter((s) => s.slot === slot && s.share >= cfg.itemMinShare && !taken.has(s.itemId))
      .map((s: ItemSlotStat): RankedItem => {
        const mine = lifts.filter((l) => l.id === s.itemId && intensity[l.trait] > 0);
        const situational = mine.reduce((sum, l) => sum + cfg.liftScale * Math.log(l.lift) * intensity[l.trait], 0);
        const reasons: Reason[] = [];
        const best = [...mine].sort((a, b) => Math.log(b.lift) * intensity[b.trait] - Math.log(a.lift) * intensity[a.trait])[0];
        if (best) reasons.push(liftReason("item", best, enemy));
        reasons.push(reason(s.winAdded >= 0 ? "loadout.item.winAdded" : "loadout.item.winAdded.negative", { id: s.itemId, slot, delta: s.winAdded, share: s.share, games: s.n }));
        return { itemId: s.itemId, slot, score: cfg.winAddedScale * s.winAdded + situational, winAdded: s.winAdded, situational, n: s.n, share: s.share, reasons };
      })
      .sort((a, b) => Number(b.winAdded >= cfg.negativeGuard) - Number(a.winAdded >= cfg.negativeGuard) || b.score - a.score);
    const [top, ...rest] = ranked;
    if (!top) continue;
    taken.add(top.itemId);
    out.push({ slot, top, alternatives: rest.slice(0, cfg.alternatives) });
  }
  return out;
}

/**
 * The loadout for a locked-in (or hovered) champion: rune page (into the lane opponent when
 * that matchup is common enough), situational runes, summoner spells, skill order, starting
 * items, core path and ranked items per slot. Everything comes from the band's builds
 * (band plus the band above); every number in a reason comes from those builds.
 */
export function buildLoadout(input: LoadoutInput): Loadout {
  const { build, config: cfg } = input;
  const enemy = teamTraits(input.enemies, input.attributes);

  const matchup = input.laneOpponent !== null ? build.matchupPages.find((p) => p.enemy === input.laneOpponent && p.n >= cfg.minMatchupGames) : undefined;
  const pageOpt = matchup ?? bestOption(build.pages, build, cfg);
  const page = choice(
    pageOpt,
    (p) => ({ primaryStyle: p.primaryStyle, subStyle: p.subStyle, runes: p.runes, statPerks: p.statPerks, games: p.games, wins: p.wins, n: p.n }),
    (p) => [matchup ? reason("loadout.page.matchup", { enemy: matchup.enemy, winRate: winRate(p), games: p.n }) : reason("loadout.page", { winRate: winRate(p), games: p.n, share: p.n / build.n })],
  );

  // Runes taken more often against teams like this one, and not already on the page.
  const onPage = new Set(page?.value.runes ?? []);
  const seen = new Set<number>();
  const situationalRunes = build.lifts
    .filter((l) => l.kind === "rune" && l.lift >= cfg.minLift && !onPage.has(l.id) && traitIntensity(enemy[l.trait], input.traitCuts[l.trait]) > 0)
    .sort((a, b) => b.lift - a.lift)
    .filter((l) => !seen.has(l.id) && seen.add(l.id))
    .slice(0, cfg.maxSituational)
    .map((l) => ({ runeId: l.id, reasons: [liftReason("rune", l, enemy)] }));

  const spells = choice(bestOption(build.spells, build, cfg), (o) => o.spells, (o) => [reason("loadout.spells", { winRate: winRate(o), games: o.n, share: o.n / build.n })]);
  // Skill order and starting items: the most common choice (taken by most players), not the best win rate.
  const common = <T extends OptionStat>(list: T[]) => list.find((o) => o.n >= cfg.minGames) ?? null;
  const timelineShare = (o: OptionStat) => o.n / Math.max(1, build.timelineN);
  const skills = choice(common(build.skills), (o) => ({ first: o.first, order: o.order }), (o) => [reason("loadout.skills", { share: timelineShare(o), games: o.n })]);
  const starting = choice(common(build.starting), (o) => o.items, (o) => [reason("loadout.starting", { share: timelineShare(o), games: o.n })]);
  // Items come from win added and lift (rankItems), never raw win rate. Without enough
  // purchases for that, the most common path is shown as what players build.
  const items = rankItems(input);
  const commonPath = common(build.core.filter((c) => c.items.length >= 3)) ?? common(build.core);
  const core: LoadoutChoice<number[]> | null = items.length
    ? { value: items.map((s) => s.top.itemId), winRate: 0, n: Math.min(...items.map((s) => s.top.n)), reasons: [] }
    : choice(commonPath, (o) => o.items, (o) => [reason("loadout.core.common", { share: timelineShare(o), games: o.n })]);

  return {
    championId: build.championId,
    role: build.role,
    games: build.n,
    page,
    situationalRunes,
    spells,
    skills,
    starting,
    core,
    items,
  };
}
