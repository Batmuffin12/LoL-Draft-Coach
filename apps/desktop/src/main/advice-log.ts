import { adviceOutcome, renderReason } from "@ldc/engine";
import type { AdviceOption, AdviceRecord, PickRecommendation, Position, RankBandId, Reason, UserMatch } from "@ldc/shared";
import type { ChampView, PostGameView } from "../shared/view";
import { reasonView } from "./reason-view";

/** A pick as the advice log keeps it: champion id, predicted win chance and its parts. */
export function adviceOption(p: Pick<PickRecommendation, "championId" | "expectedWin" | "terms">): AdviceOption {
  return { championId: p.championId, expectedWin: p.expectedWin ?? null, terms: p.terms ?? [] };
}

type Pending = Omit<AdviceRecord, "gameId"> & { gameId: number | null };

/**
 * Remembers what the coach showed when you locked in, follows the game it was for, and
 * hands the record over once that game has ended. A champ select that ends without a game
 * (a dodge) leaves nothing behind.
 */
export class AdviceRecorder {
  private suggested: AdviceOption[] = [];
  private pending: Pending | null = null;

  /** A new champ select: forget the last one. */
  newChampSelect(): void {
    this.suggested = [];
    this.pending = null;
  }

  /** The picks the panel shows right now (before you lock in), best first. */
  shown(options: AdviceOption[]): void {
    if (!this.pending) this.suggested = options;
  }

  /** You locked in: keep your pick with the suggestions shown just before. */
  locked(pick: AdviceOption, ctx: { role: Position | null; band: RankBandId; queueId: number | null; now: number }): void {
    if (this.pending?.pick.championId === pick.championId) return;
    this.pending = { gameId: null, queueId: ctx.queueId, role: ctx.role, band: ctx.band, lockedAt: ctx.now, pick, shown: this.suggested };
  }

  /** The game started: the client now knows its id. */
  gameStarted(gameId: number | null, queueId: number | null): void {
    if (!this.pending || !gameId) return;
    this.pending = { ...this.pending, gameId, queueId: queueId ?? this.pending.queueId };
  }

  /** The game ended: the finished record (once), or null when there was no locked pick or no game id. */
  gameEnded(): AdviceRecord | null {
    const p = this.pending;
    this.pending = null;
    this.suggested = [];
    return p && p.gameId ? { ...p, gameId: p.gameId } : null;
  }
}

/** The post-game card for a logged game: its result from your history, what was shown, and the largest term. */
export function postGameView(
  record: AdviceRecord,
  matches: UserMatch[],
  opts: {
    templates: Record<string, string>;
    minDeltaWin: number;
    champion: (id: number) => ChampView | null;
    championName: (id: number) => string;
    /** Your focus metric in the game (by match id), when you have a focus. */
    focus?: (matchId: string) => PostGameView["focus"];
  },
): PostGameView | null {
  const champion = opts.champion(record.pick.championId);
  if (!champion) return null;
  const o = adviceOutcome(record, matches, opts.minDeltaWin);
  const say = (r: Reason) => renderReason(r, opts.templates, opts.championName);
  const predicted = o.lines.find((r) => r.id.startsWith("postgame.predicted"));
  // The plain prediction repeats the % already shown on the pick you took in the suggestion row.
  const repeats = predicted?.id === "postgame.predicted" && record.shown.some((s) => s.championId === record.pick.championId && s.expectedWin !== null);
  const verdict: Reason = o.rank === 1 ? { id: "postgame.verdict.top", slots: {} } : o.rank > 1 ? { id: "postgame.verdict.listed", slots: { rank: o.rank } } : { id: "postgame.verdict.own", slots: {} };
  return {
    champion,
    role: record.role,
    lockedAt: record.lockedAt,
    endedAt: o.game?.endedAt ?? null,
    minutes: o.game?.minutes ?? null,
    result: o.game ? (o.game.win ? "win" : "loss") : null,
    shown: record.shown.flatMap((s) => {
      const c = opts.champion(s.championId);
      return c ? [{ champion: c, expectedWin: s.expectedWin, took: s.championId === record.pick.championId }] : [];
    }),
    verdict: say(verdict),
    followed: o.rank > 0,
    lines: o.lines.filter((r) => !r.id.startsWith("postgame.predicted")).map((r) => reasonView(r, say)),
    prediction: predicted && !repeats ? say(predicted) : null,
    focus: o.game && opts.focus ? opts.focus(o.game.matchId) : null,
  };
}
