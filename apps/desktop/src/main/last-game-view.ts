import { renderReason, sessionCheck, type GrowthFocus } from "@ldc/engine";
import type { AdviceRecord, UserMatch } from "@ldc/shared";
import type { PostGameView, ViewState } from "../shared/view";
import type { LoadedConfig } from "./config";
import { postGameView } from "./advice-log";
import { champView, type ChampionLookup } from "./draft-view";
import { focusInGame } from "./focus-view";

/**
 * The post-game card: your newest game. With the advice the coach showed for it (the advice
 * log), joined with your history for its result; a game played without the coach open shows
 * from your history alone (result and goal, no suggestions).
 */
export function lastGameView(
  latest: AdviceRecord | undefined,
  matches: UserMatch[],
  growth: GrowthFocus | null,
  opts: { explain: LoadedConfig["explain"]; minDeltaWin: number; lookup: ChampionLookup },
): PostGameView | null {
  const { explain, lookup } = opts;
  const newest = matches.reduce<UserMatch | null>((a, m) => (!a || m.match.endedAt > a.match.endedAt ? m : a), null);
  const logged = latest && (!newest || newest.match.matchId.endsWith(`_${latest.gameId}`) || latest.lockedAt > newest.match.endedAt);
  if (!logged) {
    const me = newest?.match.participants[newest.me];
    if (!newest || !me) return null;
    const champion = champView(me.championId, lookup);
    if (!champion) return null;
    return {
      champion,
      role: me.position || null,
      lockedAt: newest.match.endedAt - newest.match.durationSec * 1000,
      endedAt: newest.match.endedAt,
      minutes: Math.round(newest.match.durationSec / 60),
      result: me.win ? "win" : "loss",
      shown: [],
      verdict: "",
      followed: false,
      lines: [],
      terms: [],
      prediction: null,
      focus: focusInGame(growth, newest.match.matchId, matches, explain),
    };
  }
  return postGameView(latest, matches, {
    templates: explain.templates,
    minDeltaWin: opts.minDeltaWin,
    champion: (id) => champView(id, lookup),
    championName: (id) => lookup(id)?.name ?? `#${id}`,
    focus: (matchId) => focusInGame(growth, matchId, matches, explain),
  });
}

/** A break suggestion after a losing streak or a long session, from your own games (null: none). */
export function sessionView(matches: UserMatch[], now: number, config: Pick<LoadedConfig, "engine" | "explain">): ViewState["session"] {
  const { engine, explain } = config;
  const check = sessionCheck(matches, now, engine.session);
  if (!check) return null;
  const say = (id: string, slots: Record<string, string | number>) => renderReason({ id, slots }, explain.templates, (id) => `#${id}`);
  const lastEnded = Math.max(...matches.map((m) => m.match.endedAt));
  return {
    text: check.reason === "losses" ? say("session.losses", { streak: check.lossStreak }) : say("session.long", { games: check.games }),
    record: check.record
      ? say("session.record", { streak: check.record.afterStreak, winRate: check.record.winRate, games: check.record.games, overall: check.record.overallWinRate })
      : null,
    until: lastEnded + engine.session.gapMinutes * 60_000,
  };
}
