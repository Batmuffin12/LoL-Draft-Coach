import { formatMetric, metricLabel, renderReason, type ExplainConfig, type LearningMatchup, type LearningNotes, type NewChampAdvice } from "@ldc/engine";
import type { Reason } from "@ldc/shared";
import type { ChampView, NewChampRoleView } from "../shared/view";
import { capital } from "./reason-view";

export interface NewChampsViewDeps {
  explain: ExplainConfig;
  champion: (id: number) => ChampView | null;
  championName: (id: number) => string;
  /** "Try it in 3 to 5 Normal Draft games." */
  planGames: [number, number];
  /** What to know while learning a champion (your games on it, its matchups and power curve); null without data. */
  notes: (championId: number) => LearningNotes | null;
}

const EASE = { 1: "easy", 2: "medium", 3: "hard" } as const;
/** Reasons the table's columns already show. */
const COLUMN_REASONS = /^newchamp\.(meta|ease\.)/;

/** A learning champion's notes as lines: your record and goal on it, its matchups, its power curve. */
export function learningLines(n: LearningNotes, deps: Pick<NewChampsViewDeps, "explain" | "championName">): string[] {
  const { explain } = deps;
  const say = (r: Reason) => renderReason(r, explain.templates, deps.championName);
  const pct = (v: number) => {
    const s = (v * 100).toFixed(1);
    return v > 0 ? `+${s}%` : `${s.replace("-", "−")}%`;
  };
  const list = (xs: LearningMatchup[]) => xs.map((x) => `${deps.championName(x.championId)} (${pct(x.deltaWin)})`).join(", ");
  const lines: string[] = [];
  if (n.record.games > 0) lines.push(say({ id: "newchamp.learn.record", slots: { wins: n.record.wins, losses: n.record.games - n.record.wins } }));
  if (n.focus) {
    const f = n.focus;
    const goal = say({ id: `growth.goal.${f.lowerIsBetter ? "less" : "more"}`, slots: { target: formatMetric(f.target, f.metric, explain) } });
    lines.push(say({ id: `newchamp.learn.focus.${f.met ? "met" : "missed"}`, slots: { metric: capital(metricLabel(f.metric, explain)), value: formatMetric(f.value, f.metric, explain), goal } }));
  }
  if (n.good.length) lines.push(say({ id: "newchamp.learn.good", slots: { champions: list(n.good) } }));
  if (n.hard.length) lines.push(say({ id: "newchamp.learn.hard", slots: { champions: list(n.hard) } }));
  if (n.curve) lines.push(say({ id: n.curve.late ? "newchamp.learn.late" : "newchamp.learn.early", slots: { early: n.curve.early, late: n.curve.lateRate } }));
  return lines;
}

/** New champions for a role as the lobby shows them, with the first-games plan for the top one. */
export function newChampsView(a: NewChampAdvice, deps: NewChampsViewDeps): NewChampRoleView {
  const say = (r: Reason) => renderReason(r, deps.explain.templates, deps.championName);
  const top = a.picks[0];
  const notesOf = (id: number) => {
    const n = deps.notes(id);
    return n ? learningLines(n, deps) : [];
  };
  let plan: string | null = null;
  let planNotes: string[] = [];
  let learning: NewChampRoleView["learning"] = null;
  if (a.learning) {
    const { championId, progress: p } = a.learning;
    learning = {
      title: say({ id: "newchamp.learning", slots: { champion: championId } }),
      champion: deps.champion(championId),
      progress: p
        ? say({ id: p.daysLeft === 1 ? "newchamp.learning.progress.oneDay" : "newchamp.learning.progress", slots: { games: Math.min(p.games, p.maxGames), max: p.maxGames, days: p.daysLeft } })
        : null,
      // The build is left out: champ select shows it when you play the champion.
      lines: notesOf(championId),
      after: say({ id: "newchamp.after", slots: { champion: championId } }),
      why: say({ id: "newchamp.after.why", slots: {} }),
    };
  } else if (top) {
    const [from, to] = deps.planGames;
    plan = say({ id: "newchamp.plan", slots: { champion: top.championId, from, to } });
    planNotes = notesOf(top.championId);
  }
  return {
    role: a.role,
    picks: a.picks.flatMap((p) => {
      const champion = deps.champion(p.championId);
      if (!champion) return [];
      return [
        {
          champion,
          like: p.like !== null ? deps.champion(p.like) : null,
          winRate: p.winRate,
          games: p.games,
          ease: p.ease,
          easeLabel: say({ id: `newchamp.easeShort.${EASE[p.ease]}`, slots: {} }),
          owned: p.owned,
          // The line under the row says only what the columns don't: a pool gap it fills, "not owned"
          // (Plays like, Win % and Difficulty are columns; with no "plays like" match that reason stays).
          reasons: p.reasons.filter((r) => !COLUMN_REASONS.test(r.id) && !(p.like !== null && r.id === "newchamp.like")).map(say),
        },
      ];
    }),
    learning,
    plan,
    planNotes,
  };
}
