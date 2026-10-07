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

/** New champions for a role as the lobby shows them, with the first-games plan for the top one. */
export function newChampsView(a: NewChampAdvice, deps: NewChampsViewDeps): NewChampRoleView {
  const say = (r: Reason) => renderReason(r, deps.explain.templates, deps.championName);
  const top = a.picks[0];
  let plan: string | null = null;
  if (top) {
    const core = deps.coreItems(top.championId);
    const [from, to] = deps.planGames;
    plan = core.length
      ? say({ id: "newchamp.plan", slots: { champion: top.championId, from, to, core: core.join(", then ") } })
      : say({ id: "newchamp.plan.nocore", slots: { champion: top.championId, from, to } });
    if (deps.focus) plan += ` ${say({ id: "newchamp.plan.focus", slots: { metric: deps.focus } })}`;
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
          // The Plays like column already says who it's like; the line under the row says something else.
          reasons: p.reasons.filter((r) => !(p.like !== null && r.id === "newchamp.like")).map(say),
        },
      ];
    }),
    learning: a.learning !== null ? say({ id: "newchamp.learning", slots: { champion: a.learning } }) : null,
    plan,
  };
}
