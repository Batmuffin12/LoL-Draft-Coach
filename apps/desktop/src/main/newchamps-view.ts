import { formatMetric, metricLabel, renderReason, spikeReason, type ExplainConfig, type LearningMatchup, type LearningPlan, type NewChampAdvice } from "@ldc/engine";
import type { Reason } from "@ldc/shared";
import type { ChampView, LearnView, NewChampRoleView } from "../shared/view";
import { capital } from "./reason-view";

export interface NewChampsViewDeps {
  explain: ExplainConfig;
  champion: (id: number) => ChampView | null;
  championName: (id: number) => string;
  /** Item names for spike lines ("#id" when unknown). */
  itemName?: (id: number) => string;
  /** "Try it in 3 to 5 Normal Draft games." */
  planGames: [number, number];
  /** "Play it in blocks of 2 to 3 games." */
  blockGames: [number, number];
  /** How to learn a champion in the role (stage, focus, matchups, power curve); null without data. */
  plan: (championId: number) => LearningPlan | null;
}

const EASE = { 1: "easy", 2: "medium", 3: "hard" } as const;
/** Reasons the table's columns already show. */
const COLUMN_REASONS = /^newchamp\.(meta|ease\.)/;

/**
 * A learning plan as the New tab shows it: the stage, the one thing to watch next game, then
 * what to do at this stage, the champion's job, the role's cue, when it's strong, its matchups,
 * how long to give it and your record on it.
 */
export function learnView(p: LearningPlan, role: string, championId: number, deps: Pick<NewChampsViewDeps, "explain" | "championName" | "itemName" | "blockGames">): LearnView {
  const { explain } = deps;
  const t = explain.templates;
  const say = (r: Reason) => renderReason(r, t, deps.championName, deps.itemName ? { item: deps.itemName } : {});
  const pct = (v: number) => {
    const s = (v * 100).toFixed(1);
    return v > 0 ? `+${s}%` : `${s.replace("-", "−")}%`;
  };
  const list = (xs: LearningMatchup[]) => xs.map((x) => `${deps.championName(x.championId)} (${pct(x.deltaWin)})`).join(", ");

  let focus: LearnView["focus"] = null;
  if (p.focus) {
    const f = p.focus;
    const fmt = (v: number) => formatMetric(v, f.metric, explain);
    const slots = {
      metric: capital(metricLabel(f.metric, explain)),
      role,
      goal: say({ id: `growth.goal.${f.lowerIsBetter ? "less" : "more"}`, slots: { target: fmt(f.target) } }),
      value: f.value === null ? "" : fmt(f.value),
      usual: f.usual === null ? "" : fmt(f.usual),
    };
    const id = f.source === "drop" ? "newchamp.focus.drop" : `newchamp.focus.${f.source}${f.value === null ? "" : ".value"}`;
    focus = { text: say({ id, slots }), recent: f.recent };
  }

  const lines: string[] = [say({ id: `newchamp.stage.${p.stage}`, slots: {} })];
  if (p.stage === "practice" && p.ease === 3) lines.push(say({ id: "newchamp.stage.practice.hard", slots: {} }));
  if (p.job && t[`newchamp.job.${p.job}`]) lines.push(say({ id: `newchamp.job.${p.job}`, slots: {} }));
  if (t[`newchamp.role.${role}`]) lines.push(say({ id: `newchamp.role.${role}`, slots: {} }));
  for (const s of p.spikes) lines.push(say(spikeReason(s, "learn", championId)));
  if (p.curve) lines.push(say({ id: p.curve.late ? "newchamp.learn.late" : "newchamp.learn.early", slots: { early: p.curve.early, late: p.curve.lateRate } }));
  if (p.good.length) lines.push(say({ id: "newchamp.learn.good", slots: { champions: list(p.good) } }));
  if (p.hard.length) lines.push(say({ id: "newchamp.learn.hard", slots: { champions: list(p.hard) } }));
  const [from, to] = deps.blockGames;
  lines.push(say({ id: "newchamp.learn.settle", slots: { from, to, games: p.settleGames } }));
  if (p.record.games > 0) lines.push(say({ id: "newchamp.learn.record", slots: { wins: p.record.wins, losses: p.record.games - p.record.wins } }));
  return { stage: say({ id: `newchamp.stage.${p.stage}.label`, slots: {} }), focus, lines };
}

/** New champions for a role as the lobby shows them, with how to learn the one you're on or the top one. */
export function newChampsView(a: NewChampAdvice, deps: NewChampsViewDeps): NewChampRoleView {
  const say = (r: Reason) => renderReason(r, deps.explain.templates, deps.championName);
  const top = a.picks[0];
  const learnOf = (id: number) => {
    const p = deps.plan(id);
    return p ? learnView(p, a.role, id, deps) : null;
  };
  let plan: string | null = null;
  let planLearn: LearnView | null = null;
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
      learn: learnOf(championId) ?? { stage: "", focus: null, lines: [] },
      after: say({ id: "newchamp.after", slots: { champion: championId } }),
      why: say({ id: "newchamp.after.why", slots: {} }),
    };
  } else if (top) {
    const [from, to] = deps.planGames;
    plan = say({ id: "newchamp.plan", slots: { champion: top.championId, from, to } });
    planLearn = learnOf(top.championId);
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
    planLearn,
  };
}
