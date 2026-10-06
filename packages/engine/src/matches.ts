import type { UserMatch } from "@ldc/shared";
import type { AttributeSample, PlayerGame } from "./types";

/** The user's own game from a stored match, or null when the index is out of range. */
export function playerGame(m: UserMatch): PlayerGame | null {
  const p = m.match.participants[m.me];
  return p ? { championId: p.championId, position: p.position, win: p.win, endedAt: m.match.endedAt } : null;
}

/**
 * Every participant of a stored match as an attribute sample. The user's own
 * participant is flagged `self`, so role shares only count what others play.
 */
export function attributeSamples(m: UserMatch): AttributeSample[] {
  return m.match.participants.map((p, i) => ({
    championId: p.championId,
    position: p.position,
    physicalDamage: p.physicalDamage,
    ...(p.heal !== undefined ? { heal: p.heal } : {}),
    magicDamage: p.magicDamage,
    trueDamage: p.trueDamage,
    damageTaken: p.damageTaken,
    selfMitigated: p.selfMitigated,
    ccSeconds: p.ccSeconds,
    durationSec: m.match.durationSec,
    self: i === m.me,
  }));
}
