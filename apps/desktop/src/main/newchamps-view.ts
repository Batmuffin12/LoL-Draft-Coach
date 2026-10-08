import { renderReason, type ExplainConfig, type NewChampAdvice } from "@ldc/engine";
import type { Reason } from "@ldc/shared";
import type { ChampView, NewChampRoleView } from "../shared/view";

export interface NewChampsViewDeps {
  explain: ExplainConfig;
  champion: (id: number) => ChampView | null;
  championName: (id: number) => string;
  /** The top suggestion's usual first items in the role (names), for the plan. */
  coreItems: (championId: number) => string[];
  /** "Try it in 3 to 5 Normal Draft games." */
  planGames: [number, number];
  /** Your current focus metric ("CS per minute"), if any. */
  focus: string | null;
}

const EASE = { 1: "easy", 2: "medium", 3: "hard" } as const;
/** Reasons the table's columns already show. */
const COLUMN_REASONS = /^newchamp\.(meta|ease\.)/;

/** New champions for a role as the lobby shows them, with the first-games plan for the top one. */
export function newChampsView(a: NewChampAdvice, deps: NewChampsViewDeps): NewChampRoleView {
  const say = (r: Reason) => renderReason(r, deps.explain.templates, deps.championName);
  const top = a.picks[0];
  const focus = deps.focus ? say({ id: "newchamp.plan.focus", slots: { metric: deps.focus } }) : null;
  let plan: string | null = null;
  let learning: NewChampRoleView["learning"] = null;
  if (a.learning) {
    const { championId, progress: p } = a.learning;
    const core = deps.coreItems(championId);
    const lines = [core.length ? say({ id: "newchamp.learning.plan", slots: { core: core.join(", then ") } }) : null, focus].filter((s): s is string => !!s);
    learning = {
      title: say({ id: "newchamp.learning", slots: { champion: championId } }),
      champion: deps.champion(championId),
      progress: p
        ? say({ id: p.daysLeft === 1 ? "newchamp.learning.progress.oneDay" : "newchamp.learning.progress", slots: { games: Math.min(p.games, p.maxGames), max: p.maxGames, days: p.daysLeft } })
        : null,
      plan: lines.length ? lines.join(" ") : null,
      after: say({ id: "newchamp.after", slots: { champion: championId } }),
      why: say({ id: "newchamp.after.why", slots: {} }),
    };
  } else if (top) {
    const core = deps.coreItems(top.championId);
    const [from, to] = deps.planGames;
    plan = core.length
      ? say({ id: "newchamp.plan", slots: { champion: top.championId, from, to, core: core.join(", then ") } })
      : say({ id: "newchamp.plan.nocore", slots: { champion: top.championId, from, to } });
    if (focus) plan += ` ${focus}`;
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
  };
}
