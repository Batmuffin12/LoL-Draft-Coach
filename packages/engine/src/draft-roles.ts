import type { ChampionId, DraftState, Position } from "@ldc/shared";
import type { MetaIndex } from "./meta-index";

/** A champion in the draft with the role it most likely plays. */
export interface PlacedChampion {
  championId: ChampionId;
  role: Position;
}

/**
 * The most likely role for each champion of one team, assigned jointly (no two share a
 * role) from how often each champion plays each role in the band. `fixed` roles (an
 * ally's assigned position) are kept and taken out of the pool, as are `reserved` roles
 * (the local player's own). Brute force over the open roles: a team has at most five
 * champions.
 */
export function assignRoles(
  champions: { championId: ChampionId; role?: Position }[],
  index: MetaIndex,
  reserved: Position[] = [],
): PlacedChampion[] {
  const fixed = champions.filter((c): c is PlacedChampion => !!c.role && index.roles.includes(c.role));
  const open = champions.filter((c) => !fixed.includes(c as PlacedChampion));
  const freeRoles = index.roles.filter((r) => !reserved.includes(r) && !fixed.some((f) => f.role === r));
  const dist = new Map(open.map((c) => [c.championId, index.roleDistribution(c.championId)]));

  let best: Position[] = [];
  let bestScore = -Infinity;
  const pick = (i: number, used: Set<Position>, chosen: Position[], score: number) => {
    if (i === open.length) {
      if (score > bestScore) [best, bestScore] = [[...chosen], score];
      return;
    }
    for (const r of freeRoles) {
      if (used.has(r)) continue;
      used.add(r);
      chosen.push(r);
      pick(i + 1, used, chosen, score + Math.log((dist.get(open[i]!.championId)?.get(r) ?? 0) + 1e-3));
      chosen.pop();
      used.delete(r);
    }
  };
  if (open.length <= freeRoles.length) pick(0, new Set(), [], 0);

  return [...fixed, ...open.map((c, i) => ({ championId: c.championId, role: best[i] ?? index.mainRole(c.championId) ?? "" }))];
}

/** Locked (or, for allies, hovered) champions with their roles, from the local player's view. */
export function placeDraft(draft: DraftState, index: MetaIndex, myRole: Position | null): { allies: PlacedChampion[]; enemies: PlacedChampion[] } {
  const allies = assignRoles(
    draft.myTeam
      .filter((s) => !s.isLocalPlayer && (s.championId || s.pickIntentId))
      .map((s) => ({ championId: s.championId || s.pickIntentId, ...(s.position ? { role: s.position } : {}) })),
    index,
    myRole ? [myRole] : [],
  );
  const enemies = assignRoles(
    draft.theirTeam.filter((s) => s.championId > 0).map((s) => ({ championId: s.championId, ...(s.position ? { role: s.position } : {}) })),
    index,
  );
  return { allies, enemies };
}
