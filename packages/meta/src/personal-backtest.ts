import { assessPick, computeComfort, winOf, type EngineConfig, type LiveInput, type MetaIndex, type PlayerGame } from "@ldc/engine";
import type { RankBandId, UserMatch } from "@ldc/shared";
import { draftFor, type Prediction } from "./backtest";

/**
 * Backtest of the personal ("You") term on players' own games, the one term the collected
 * games can't test (they are anonymous). For each game, comfort is rebuilt from that player's
 * strictly earlier games only (no mastery: today's mastery would leak the future), the pick is
 * scored in its real draft, and the game's personal and other rating points are kept, so the
 * personal term's strength can be judged: as is, off, or scaled.
 */
export interface PersonalGame {
  matchId: string;
  won: boolean;
  /** Rating points of the personal term, and of every other term together. */
  personal: number;
  rest: number;
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
        const personal = terms.filter((t) => t.name === "personal").reduce((s, t) => s + t.rating, 0);
        const rest = terms.filter((t) => t.name !== "personal").reduce((s, t) => s + t.rating, 0);
        out.push({ matchId: m.match.matchId, won: me.win, personal, rest, priorGames: played.filter((g) => g.championId === me.championId).length });
      }
      if (me?.position) played.push({ championId: me.championId, position: me.position, win: me.win, endedAt: m.match.endedAt });
    }
  }
  return out;
}

/** Predictions with the personal term scaled by `scale` (1 = as configured, 0 = off). */
export function personalPredictions(games: PersonalGame[], scale: number): Prediction[] {
  return games.map((g) => ({ p: winOf(g.rest + scale * g.personal), won: g.won, matchId: g.matchId }));
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
