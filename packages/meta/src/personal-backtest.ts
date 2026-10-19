import { assessPick, computeComfort, rating, winOf, type EngineConfig, type LiveInput, type MetaIndex, type PlayerGame } from "@ldc/engine";
import { TERM_NAMES, type RankBandId, type UserMatch } from "@ldc/shared";
import { draftFor, type Prediction } from "./backtest";

/**
 * Backtest of the personal ("You") term on players' own games, the one term the collected
 * games can't test (they are anonymous). For each game, comfort is rebuilt from that player's
 * strictly earlier games only (no mastery: today's mastery would leak the future), the pick is
 * scored in its real draft, and the game's personal and other rating points are kept, so the
 * personal term's strength can be judged: as is, off, or scaled. Every prediction starts from the
 * player's own earlier win rate, so the term is credited only for what it adds beyond how good
 * the player is overall (not for differences between players).
 */
/** Earlier games of the player count against this many even games for their baseline win rate. */
const BASELINE_PRIOR = 20;

export interface PersonalGame {
  matchId: string;
  won: boolean;
  /** Rating points of the personal term, and of the other terms in the shown chance (config inChance). */
  personal: number;
  rest: number;
  /** The player's win rate in their earlier games, smoothed toward 50%. */
  baseline: number;
  /** Games the player had on this champion before this one. */
  priorGames: number;
}

export function personalGames(histories: UserMatch[][], index: MetaIndex, band: RankBandId, engine: EngineConfig, minPriorGames = 20): PersonalGame[] {
  const out: PersonalGame[] = [];
  for (const history of histories) {
    const games = [...history].sort((a, b) => a.match.endedAt - b.match.endedAt);
    const played: PlayerGame[] = [];
    for (const m of games) {
      const me = m.match.participants[m.me];
      const ready = me?.position && m.match.participants.every((p) => p.position);
      if (me && ready && played.length >= minPriorGames) {
        const role = me.position;
        const comfort = computeComfort(played, [], m.match.endedAt - 1, engine.comfort, role);
        const input: LiveInput = {
          draft: draftFor(m.match, m.me),
          pickable: [me.championId],
          unavailable: new Set(m.match.participants.filter((_, j) => j !== m.me).map((p) => p.championId)),
          comfort,
          attributes: new Map(),
          intendedPositions: new Map(),
          role,
          weights: engine.bands[String(band)] ?? Object.values(engine.bands)[0]!,
          config: engine,
          index,
          band,
        };
        const terms = assessPick(input, me.championId).terms ?? [];
        const counted = new Set<string>(engine.rating.inChance ?? TERM_NAMES);
        const personal = terms.filter((t) => t.name === "personal").reduce((s, t) => s + t.rating, 0);
        const rest = terms.filter((t) => t.name !== "personal" && counted.has(t.name)).reduce((s, t) => s + t.rating, 0);
        const wins = played.filter((g) => g.win).length;
        const baseline = (wins + BASELINE_PRIOR / 2) / (played.length + BASELINE_PRIOR);
        out.push({ matchId: m.match.matchId, won: me.win, personal, rest, baseline, priorGames: played.filter((g) => g.championId === me.championId).length });
      }
      if (me?.position) played.push({ championId: me.championId, position: me.position, win: me.win, endedAt: m.match.endedAt });
    }
  }
  return out;
}

/** Predictions from the player's baseline with the personal term scaled by `scale` (1 = as configured, 0 = off). */
export function personalPredictions(games: PersonalGame[], scale: number): Prediction[] {
  return games.map((g) => ({ p: winOf(rating(g.baseline) + g.rest + scale * g.personal), won: g.won, matchId: g.matchId }));
}

/**
 * Win rate by experience on the champion before the game (your own learning curve): buckets of
 * prior games, e.g. [0, 1, 5, 20] → "0", "1–4", "5–19", "20+".
 */
export function experienceCurve(games: PersonalGame[], edges: number[]): { from: number; to: number | null; games: number; winRate: number }[] {
  return edges.map((from, i) => {
    const to = edges[i + 1] ?? null;
    const g = games.filter((x) => x.priorGames >= from && (to === null || x.priorGames < to));
    return { from, to, games: g.length, winRate: g.length ? g.filter((x) => x.won).length / g.length : NaN };
  });
}
