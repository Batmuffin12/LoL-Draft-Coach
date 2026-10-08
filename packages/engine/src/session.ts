import type { UserMatch } from "@ldc/shared";
import type { EngineConfig } from "./config";

export type SessionConfig = EngineConfig["session"];

export interface SessionCheck {
  /** Why the check shows: a losing streak, or a long session. */
  reason: "losses" | "long";
  /** Games in the current session, and its losses in a row at the end. */
  games: number;
  lossStreak: number;
  /**
   * Your own record in games played right after this many losses in a row in one session, and
   * overall; null when you have too few such games to quote.
   */
  record: { afterStreak: number; games: number; winRate: number; overallWinRate: number } | null;
}

const MINUTE = 60_000;

/**
 * Splits your games into sessions: games that ended within `gapMinutes` of the previous one.
 * Oldest first, each session oldest first.
 */
function sessions(matches: UserMatch[], gapMs: number): { endedAt: number; win: boolean }[][] {
  const games = matches
    .map((m) => ({ endedAt: m.match.endedAt, win: m.match.participants[m.me]?.win ?? false }))
    .sort((a, b) => a.endedAt - b.endedAt);
  const out: { endedAt: number; win: boolean }[][] = [];
  for (const g of games) {
    const last = out.at(-1);
    if (last && g.endedAt - last.at(-1)!.endedAt <= gapMs) last.push(g);
    else out.push([g]);
  }
  return out;
}

/**
 * Whether to suggest a break now: the session still running (your last game ended within the
 * gap) has ended in `lossStreak` losses or reached `longSession` games. Pure: `now` is passed in.
 */
export function sessionCheck(matches: UserMatch[], now: number, cfg: SessionConfig): SessionCheck | null {
  const gapMs = cfg.gapMinutes * MINUTE;
  const all = sessions(matches, gapMs);
  const current = all.at(-1);
  if (!current || now - current.at(-1)!.endedAt > gapMs) return null;
  let lossStreak = 0;
  for (let i = current.length - 1; i >= 0 && !current[i]!.win; i--) lossStreak++;
  const reason = lossStreak >= cfg.lossStreak ? "losses" : current.length >= cfg.longSession ? "long" : null;
  if (!reason) return null;

  // Your record right after `cfg.lossStreak` losses in a row in one session (the current game excluded: it hasn't happened).
  const after: boolean[] = [];
  for (const s of all) {
    for (let i = cfg.lossStreak; i < s.length; i++) {
      if (s.slice(i - cfg.lossStreak, i).every((g) => !g.win)) after.push(s[i]!.win);
    }
  }
  const total = all.flat();
  const record =
    after.length >= cfg.minGames
      ? {
          afterStreak: cfg.lossStreak,
          games: after.length,
          winRate: after.filter(Boolean).length / after.length,
          overallWinRate: total.filter((g) => g.win).length / total.length,
        }
      : null;
  return { reason, games: current.length, lossStreak, record };
}
