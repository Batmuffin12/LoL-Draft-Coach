import type { ChampionAttributes, ChampionId, ChampionRoleStat, MetaSnapshot, Position } from "@ldc/shared";
import type { RatingConfig } from "./config";
import { rating, smoothRate, winOf } from "./rating";

/** A statistic of one champion (or pair) from the snapshot, seen from the first champion's side. */
export interface Stat {
  games: number;
  wins: number;
  /** Unweighted game count. */
  n: number;
}

const NONE: Stat = { games: 0, wins: 0, n: 0 };
const key = (id: ChampionId, role: Position) => `${id}|${role}`;
const pairKey = (a: ChampionId, ra: Position, b: ChampionId, rb: Position) => `${a}|${ra}|${b}|${rb}`;

/** A matchup or duo delta: rating points over the expectation from the two champions' meta strength. */
export interface PairDelta {
  /** Rating points (0 when there is no data: smoothing returns the expectation). */
  delta: number;
  /** Unweighted games behind it. */
  n: number;
}

/**
 * Fast lookups over a band's meta snapshot, plus the rating maths built on it. Built
 * once per snapshot; pure (no I/O).
 */
export class MetaIndex {
  private readonly champs = new Map<string, ChampionRoleStat>();
  private readonly byChampion = new Map<ChampionId, ChampionRoleStat[]>();
  private readonly matchups = new Map<string, Stat>();
  private readonly duos = new Map<string, Stat>();
  readonly attributes: Map<ChampionId, ChampionAttributes>;
  private readonly bansById: Map<ChampionId, { bans: number; n: number }>;
  /** Roles seen in the data, most games first (positions come from Riot's data, never from code). */
  readonly roles: Position[];

  constructor(
    readonly snapshot: MetaSnapshot,
    private readonly cfg: RatingConfig,
  ) {
    for (const c of snapshot.champions) {
      this.champs.set(key(c.championId, c.role), c);
      const list = this.byChampion.get(c.championId) ?? [];
      list.push(c);
      this.byChampion.set(c.championId, list);
    }
    for (const [a, ra, b, rb, games, wins, n] of snapshot.matchups) this.matchups.set(pairKey(a, ra, b, rb), { games, wins, n });
    for (const [a, ra, b, rb, games, wins, n] of snapshot.duos) this.duos.set(pairKey(a, ra, b, rb), { games, wins, n });
    this.attributes = new Map(snapshot.attributes.map((a) => [a.championId, a]));
    this.bansById = new Map((snapshot.bans ?? []).map((b) => [b.championId, b]));
    this.roles = Object.entries(snapshot.roleGames)
      .sort((x, y) => y[1] - x[1])
      .map(([r]) => r);
  }

  champion(id: ChampionId, role: Position): Stat {
    return this.champs.get(key(id, role)) ?? NONE;
  }

  /** Champions played in a role, most games first. */
  championsIn(role: Position): ChampionRoleStat[] {
    return this.snapshot.champions.filter((c) => c.role === role).sort((a, b) => b.games - a.games || a.championId - b.championId);
  }

  /** Share of matches in which the champion was picked in this role (0..1). */
  pickRate(id: ChampionId, role: Position): number {
    const matches = (this.snapshot.roleGames[role] ?? 0) / 2; // two players per role per match
    return matches > 0 ? this.champion(id, role).games / matches : 0;
  }

  /**
   * Share of games (with ban data) in which the champion was banned, and how many such
   * games there were; null when the snapshot has no ban data.
   */
  banRate(id: ChampionId): { rate: number; games: number } | null {
    const total = this.snapshot.banMatches ?? 0;
    if (!this.snapshot.bans || total <= 0) return null;
    const b = this.bansById.get(id);
    return { rate: b ? b.bans / total : 0, games: total };
  }

  /** Share of the champion's games in each role. */
  roleDistribution(id: ChampionId): Map<Position, number> {
    const list = this.byChampion.get(id) ?? [];
    const total = list.reduce((s, c) => s + c.games, 0);
    return new Map(list.map((c) => [c.role, total > 0 ? c.games / total : 0]));
  }

  /** The champion's most played role, or null when unseen. */
  mainRole(id: ChampionId): Position | null {
    let best: ChampionRoleStat | null = null;
    for (const c of this.byChampion.get(id) ?? []) if (!best || c.games > best.games) best = c;
    return best?.role ?? null;
  }

  /** Opponent pair from a's side. */
  matchup(a: ChampionId, ra: Position, b: ChampionId, rb: Position): Stat {
    return orient(this.matchups, a, ra, b, rb);
  }

  /** Ally pair (wins of the team with both). */
  duo(a: ChampionId, ra: Position, b: ChampionId, rb: Position): Stat {
    return orient(this.duos, a, ra, b, rb, true);
  }

  /** Meta strength: rating of the champion's smoothed win rate in the role (0 = an average champion). */
  metaRating(id: ChampionId, role: Position): number {
    const s = this.champion(id, role);
    return rating(smoothRate(s.wins, s.games, 0.5, this.cfg.priorGames.meta));
  }

  /** How much better `a` does against `b` than their meta strengths predict. */
  matchupDelta(a: ChampionId, ra: Position, b: ChampionId, rb: Position): PairDelta {
    const expected = winOf(this.metaRating(a, ra) - this.metaRating(b, rb));
    const s = this.matchup(a, ra, b, rb);
    return { delta: rating(smoothRate(s.wins, s.games, expected, this.cfg.priorGames.pair)) - rating(expected), n: s.n };
  }

  /** How much better `a` and `b` do together than their meta strengths predict. */
  duoDelta(a: ChampionId, ra: Position, b: ChampionId, rb: Position): PairDelta {
    const expected = winOf(this.metaRating(a, ra) + this.metaRating(b, rb));
    const s = this.duo(a, ra, b, rb);
    return { delta: rating(smoothRate(s.wins, s.games, expected, this.cfg.priorGames.pair)) - rating(expected), n: s.n };
  }
}

/** Pairs are stored once (lower champion id first); flips wins when looking from the other side. */
function orient(map: Map<string, Stat>, a: ChampionId, ra: Position, b: ChampionId, rb: Position, symmetric = false): Stat {
  const direct = map.get(pairKey(a, ra, b, rb));
  if (direct) return direct;
  const flipped = map.get(pairKey(b, rb, a, ra));
  if (!flipped) return NONE;
  return symmetric ? flipped : { games: flipped.games, wins: flipped.games - flipped.wins, n: flipped.n };
}
