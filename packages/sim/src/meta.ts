import type { ChampionAttributes, ChampionBuild, ChampionRoleStat, EnemyTrait, MetaSnapshot, PairStat, Position, RankBandId } from "@ldc/shared";

/**
 * Synthetic meta snapshot for tests and dev runs: you choose each champion's games and win
 * rate, so "thin" and "solid" data can both be produced on purpose (solid builds have at
 * least the engine config's `loadout.solidGames` games). Ids are test data.
 *
 *   meta().champion(103, "middle", { games: 900, winRate: 0.53 }).matchup(103, 238, "middle", { games: 300, winRate: 0.55 }).build()
 */

export interface StatSpec {
  games: number;
  winRate?: number;
}

/** One build option: how many of the build's games took it and how they did. */
export interface OptionSpec {
  share?: number;
  winRate?: number;
}

export interface BuildSpec {
  /** Games behind the build (below `loadout.solidGames` = thin). */
  games: number;
  winRate?: number;
  pages?: ({ primaryStyle: number; subStyle: number; runes: number[]; statPerks: number[] } & OptionSpec)[];
  spells?: ({ spells: number[] } & OptionSpec)[];
  /** Skill slots 1 = Q … 3 = E. */
  skills?: ({ first: number[]; order: number[] } & OptionSpec)[];
  starting?: ({ items: number[] } & OptionSpec)[];
  core?: ({ items: number[] } & OptionSpec)[];
  /** Completed items by slot (1 = first); share of the slot, win added, average minute. */
  items?: { itemId: number; slot: number; share: number; winAdded?: number; minute?: number }[];
}

const ROLES = ["top", "jungle", "middle", "bottom", "utility"];

export class MetaSim {
  private champions: ChampionRoleStat[] = [];
  private matchups: PairStat[] = [];
  private duos: PairStat[] = [];
  private banRates: { championId: number; rate: number }[] = [];
  private attributes: ChampionAttributes[] = [];
  private builds: ChampionBuild[] = [];
  private references: MetaSnapshot["references"] = {};
  /** Band-average enemy-team traits (the app needs them to build a loadout); neutral unless set. */
  private cuts: Record<EnemyTrait, number> = { magic: 0.4, physical: 0.6, frontline: 0.5, engage: 0.5, heal: 0.5 };

  constructor(private readonly opts: { band?: RankBandId; patch?: string; createdAt?: number; matches?: number } = {}) {}

  /** A champion in a role with its games and win rate (default 50%). */
  champion(championId: number, role: Position, spec: StatSpec): this {
    const wr = spec.winRate ?? 0.5;
    this.champions.push({ championId, role, games: spec.games, wins: spec.games * wr, n: Math.round(spec.games) });
    return this;
  }

  /** Two champions as opponents (same role = lane matchup): the first one's win rate against the second. */
  matchup(a: number, b: number, role: Position, spec: StatSpec & { roleB?: Position }): this {
    this.matchups.push(pair(a, role, b, spec.roleB ?? role, spec));
    return this;
  }

  /** Two champions on the same team: their win rate together. */
  duo(a: number, roleA: Position, b: number, roleB: Position, spec: StatSpec): this {
    this.duos.push(pair(a, roleA, b, roleB, spec));
    return this;
  }

  /** A ban rate (0..1) over the snapshot's matches. */
  ban(championId: number, rate: number): this {
    this.banRates.push({ championId, rate });
    return this;
  }

  /** Measured attributes; anything not given is neutral (0.5, a physical/magic split of 50/50). */
  attribute(championId: number, a: Partial<Omit<ChampionAttributes, "championId">> & { role?: Position }): this {
    const { role, ...rest } = a;
    this.attributes.push({
      championId,
      samples: 200,
      physicalShare: 0.5,
      magicShare: 0.5,
      trueShare: 0,
      frontline: 0.5,
      engage: 0.5,
      roleShares: Object.fromEntries(ROLES.map((r) => [r, role ? (r === role ? 1 : 0) : 0.2])),
      roleSamples: 200,
      ...rest,
    });
    return this;
  }

  /** A build for a champion in a role; `games` below `loadout.solidGames` makes it thin. */
  build(championId: number, role: Position, spec: BuildSpec): this {
    const wr = spec.winRate ?? 0.5;
    const opt = <T extends OptionSpec>(o: T, i: number, count: number) => {
      const share = o.share ?? (count === 1 ? 1 : i === 0 ? 0.6 : 0.4 / (count - 1));
      const n = Math.round(spec.games * share);
      const { share: _s, winRate, ...rest } = o;
      return { ...rest, games: n, wins: n * (winRate ?? wr), n };
    };
    const list = <T extends OptionSpec>(xs: T[] | undefined) => (xs ?? []).map((o, i, all) => opt(o, i, all.length));
    this.builds.push({
      championId,
      role,
      n: spec.games,
      timelineN: spec.items?.length ? spec.games : 0,
      games: spec.games,
      wins: spec.games * wr,
      pages: list(spec.pages) as ChampionBuild["pages"],
      spells: list(spec.spells) as ChampionBuild["spells"],
      skills: list(spec.skills) as ChampionBuild["skills"],
      starting: list(spec.starting) as ChampionBuild["starting"],
      core: list(spec.core) as ChampionBuild["core"],
      items: (spec.items ?? []).map((it) => ({ itemId: it.itemId, slot: it.slot, n: Math.round(spec.games * it.share), share: it.share, winAdded: it.winAdded ?? 0, minute: it.minute ?? 10 + it.slot * 6 })),
      lifts: [],
      matchupPages: [],
    });
    return this;
  }

  /** Playstyle reference quantiles for a role and metric (evenly spaced, min … max). */
  reference(role: Position, metric: string, quantiles: number[], n = 500): this {
    (this.references[role] ??= {})[metric] = { n, quantiles };
    return this;
  }

  /** Overrides the band-average enemy-team traits above which a trait counts as high. */
  traitCuts(cuts: Partial<Record<EnemyTrait, number>>): this {
    this.cuts = { ...this.cuts, ...cuts };
    return this;
  }

  done(): MetaSnapshot {
    const matches = this.matchCount();
    const roleGames = Object.fromEntries(ROLES.map((r) => [r, Math.max(matches, ...this.champions.filter((c) => c.role === r).map((c) => c.games))]));
    const createdAt = this.opts.createdAt ?? Date.now();
    return {
      format: 1,
      band: this.opts.band ?? 2,
      createdAt,
      patch: this.opts.patch ?? null,
      matches,
      newestMatchAt: createdAt,
      halfLifeDays: 10,
      roleGames,
      champions: this.champions,
      bans: this.banRates.map((b) => ({ championId: b.championId, bans: b.rate * matches, n: Math.round(b.rate * matches) })),
      banMatches: matches,
      matchups: this.matchups,
      duos: this.duos,
      attributes: this.attributes,
      builds: this.builds,
      references: this.references,
      traitCuts: this.cuts,
    };
  }

  /** Matches behind the snapshot: given, or the busiest role's champion games. */
  private matchCount(): number {
    if (this.opts.matches) return this.opts.matches;
    const perRole = ROLES.map((r) => this.champions.filter((c) => c.role === r).reduce((s, c) => s + c.games, 0));
    return Math.max(1000, ...perRole);
  }
}

function pair(a: number, ra: Position, b: number, rb: Position, spec: StatSpec): PairStat {
  const wr = spec.winRate ?? 0.5;
  return [a, ra, b, rb, spec.games, spec.games * wr, Math.round(spec.games)];
}

/** Starts a synthetic meta snapshot. */
export function meta(opts: ConstructorParameters<typeof MetaSim>[0] = {}): MetaSim {
  return new MetaSim(opts);
}
