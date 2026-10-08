import type { ChampionAttributes, ChampionId, Reason } from "@ldc/shared";
import type { EngineConfig } from "./config";
import { reason } from "./explain";
import type { LiveInput } from "./live";
import { placeDraft } from "./draft-roles";
import { deltaWin } from "./rating";

export type PlanConfig = EngineConfig["plan"];

/** One team's measured shape: how its champions do in short and long games, and its damage split. */
interface TeamShape {
  /** Mean (long-game − short-game win rate) of champions with a measured power curve; null with none. */
  scaling: number | null;
  /** Damage-weighted physical and magic share (champions with attributes). */
  physical: number | null;
  magic: number | null;
  /** The champion with the most crowd control, when it is in the top `engageMin` of champions. */
  engager: ChampionId | null;
}

function shape(ids: ChampionId[], attrs: Map<ChampionId, ChampionAttributes>, cfg: PlanConfig, minGames: number): TeamShape {
  const known = ids.map((id) => attrs.get(id)).filter((a): a is ChampionAttributes => !!a);
  const curves = known
    .map((a) => a.powerCurve)
    .filter((c): c is NonNullable<ChampionAttributes["powerCurve"]> => !!c && c.early.games >= minGames && c.late.games >= minGames);
  const engager = known.filter((a) => a.engage >= cfg.engageMin).sort((a, b) => b.engage - a.engage)[0];
  return {
    scaling: curves.length ? curves.reduce((s, c) => s + c.late.winRate - c.early.winRate, 0) / curves.length : null,
    physical: known.length ? known.reduce((s, a) => s + a.physicalShare, 0) / known.length : null,
    magic: known.length ? known.reduce((s, a) => s + a.magicShare, 0) / known.length : null,
    engager: engager?.championId ?? null,
  };
}

/**
 * How this game is likely to go once you locked in `championId`, in a few lines a player can
 * use (the review's "game plan"): the lane matchup in words, which team wins longer games, their
 * damage type, and their main engage. Champions and measured aggregates only, never a player.
 * Every number comes from the band's snapshot. Pure.
 */
export function gamePlan(input: LiveInput, championId: ChampionId): Reason[] {
  const { index, role, config } = input;
  const cfg = config.plan;
  const minGames = config.rating.minGames;
  const attrs = new Map([...input.attributes, ...index.attributes]);
  const { allies, enemies } = placeDraft(input.draft, index, role);
  const out: Reason[] = [];

  // Lane: the revealed opponent, in a word.
  const laneEnemy = role ? enemies.find((e) => e.role === role) : undefined;
  if (role && laneEnemy) {
    const d = index.matchupDelta(championId, role, laneEnemy.championId, laneEnemy.role);
    if (d.n >= minGames.pair) {
      const delta = deltaWin(d.delta);
      const word = Math.abs(delta) < cfg.evenWin ? "even" : delta > 0 ? "favoured" : "hard";
      out.push(reason(`plan.lane.${word}`, { enemy: laneEnemy.championId, delta, games: d.n }));
    }
  }

  // Which team wins longer games (measured power curves of both teams).
  const ours = shape([championId, ...allies.map((a) => a.championId).filter((id) => id !== championId)], attrs, cfg, minGames.meta);
  const theirs = shape(
    enemies.map((e) => e.championId),
    attrs,
    cfg,
    minGames.meta,
  );
  if (ours.scaling !== null && theirs.scaling !== null && Math.abs(ours.scaling - theirs.scaling) >= cfg.scalingGap) {
    out.push(reason(ours.scaling > theirs.scaling ? "plan.scaling.us" : "plan.scaling.them", { gap: Math.abs(ours.scaling - theirs.scaling) }));
  }

  // Their damage type, when one side dominates.
  if (theirs.physical !== null && theirs.physical >= cfg.damageShare) out.push(reason("plan.damage.physical", { share: theirs.physical }));
  else if (theirs.magic !== null && theirs.magic >= cfg.damageShare) out.push(reason("plan.damage.magic", { share: theirs.magic }));

  // Their main engage.
  if (theirs.engager !== null) out.push(reason("plan.engage", { enemy: theirs.engager }));
  return out;
}

/**
 * Their team in short, during champ select (once at least `minEnemies` are picked): its damage
 * type when one side dominates, and its main engage. Measured aggregates only. Pure.
 */
export function enemyTeamNotes(input: LiveInput, minEnemies = 2): Reason[] {
  const { index, role, config } = input;
  const attrs = new Map([...input.attributes, ...index.attributes]);
  const { enemies } = placeDraft(input.draft, index, role);
  if (enemies.length < minEnemies) return [];
  const theirs = shape(
    enemies.map((e) => e.championId),
    attrs,
    config.plan,
    config.rating.minGames.meta,
  );
  const out: Reason[] = [];
  if (theirs.physical !== null && theirs.physical >= config.plan.damageShare) out.push(reason("draft.damage.physical", { share: theirs.physical }));
  else if (theirs.magic !== null && theirs.magic >= config.plan.damageShare) out.push(reason("draft.damage.magic", { share: theirs.magic }));
  if (theirs.engager !== null) out.push(reason("draft.engage", { enemy: theirs.engager }));
  return out;
}
