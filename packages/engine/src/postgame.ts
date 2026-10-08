import type { AdviceRecord, Reason, TermName, UserMatch } from "@ldc/shared";

/** One logged piece of advice joined with the game it was for (once that game is in your history). */
export interface AdviceOutcome {
  record: AdviceRecord;
  /** Your own result in the game; null until the game is in your Match-V5 history. */
  game: { matchId: string; win: boolean; minutes: number; endedAt: number } | null;
  /** Where your pick was among the suggestions (1 = the top pick); 0 = your own pick. */
  rank: number;
  /** What the draft looked like: the largest part of your pick's win chance, and the prediction. Never a grade. */
  lines: Reason[];
}

/** Match-V5 ids end in the client's game id ("EUW1_7123456789"). */
function gameIdOf(matchId: string): number | null {
  const m = /_(\d+)$/.exec(matchId);
  return m ? Number(m[1]) : null;
}

/**
 * Joins advice with the player's own matches: the result, where the pick was among the
 * suggestions, and the term that mattered most. Pure: the caller provides the matches.
 */
export function adviceOutcome(record: AdviceRecord, matches: UserMatch[], minDeltaWin: number): AdviceOutcome {
  const found = matches.find((m) => gameIdOf(m.match.matchId) === record.gameId);
  const me = found?.match.participants[found.me];
  const game = found && me ? { matchId: found.match.matchId, win: me.win, minutes: Math.round(found.match.durationSec / 60), endedAt: found.match.endedAt } : null;
  const rank = record.shown.findIndex((s) => s.championId === record.pick.championId) + 1;

  const lines: Reason[] = [];
  const biggest = [...record.pick.terms].sort((a, b) => Math.abs(b.deltaWin) - Math.abs(a.deltaWin))[0];
  if (biggest && Math.abs(biggest.deltaWin) >= minDeltaWin) {
    lines.push({ id: `postgame.${biggest.name satisfies TermName}.${biggest.deltaWin > 0 ? "edge" : "bad"}`, slots: { delta: biggest.deltaWin } });
  }
  const top = record.shown[0];
  if (record.pick.expectedWin !== null) {
    if (top && rank !== 1 && top.expectedWin !== null) {
      lines.push({ id: "postgame.predicted.vs", slots: { win: record.pick.expectedWin, champion: record.pick.championId, top: top.championId, topWin: top.expectedWin } });
    } else lines.push({ id: "postgame.predicted", slots: { win: record.pick.expectedWin, champion: record.pick.championId } });
  }
  return { record, game, rank, lines };
}
