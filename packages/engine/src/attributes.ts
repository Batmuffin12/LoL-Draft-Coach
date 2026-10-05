import type { ChampionId } from "@ldc/shared";
import { percentile } from "./comfort";
import type { AttributeSample, ChampionAttributes } from "./types";

/**
 * Derives champion attributes from match participants, as the spec requires
 * (measured, not labelled):
 * - damage type: share of physical / magic / true damage to champions
 * - frontline: (damage taken + self-mitigated) per minute, as a percentile
 * - engage/CC: seconds of CC on others per minute, as a percentile
 * - roles: share of samples per position
 * Champions with fewer than `minSamples` samples are left out ("not enough data").
 */
export function deriveChampionAttributes(samples: AttributeSample[], minSamples: number): Map<ChampionId, ChampionAttributes> {
  const groups = new Map<ChampionId, AttributeSample[]>();
  for (const s of samples) groups.set(s.championId, [...(groups.get(s.championId) ?? []), s]);

  interface Raw {
    id: ChampionId;
    n: number;
    phys: number;
    magic: number;
    tru: number;
    tank: number;
    cc: number;
    roles: Record<string, number>;
    others: number;
  }
  const raws: Raw[] = [];
  for (const [id, list] of groups) {
    if (list.length < minSamples) continue;
    let phys = 0;
    let magic = 0;
    let tru = 0;
    let minutes = 0;
    let tank = 0;
    let cc = 0;
    const roles: Record<string, number> = {};
    for (const s of list) {
      phys += s.physicalDamage;
      magic += s.magicDamage;
      tru += s.trueDamage;
      tank += s.damageTaken + s.selfMitigated;
      cc += s.ccSeconds;
      minutes += Math.max(1, s.durationSec / 60);
      if (s.position && !s.self) roles[s.position] = (roles[s.position] ?? 0) + 1;
    }
    const others = list.filter((s) => !s.self).length;
    const dmg = phys + magic + tru || 1;
    raws.push({
      id,
      n: list.length,
      phys: phys / dmg,
      magic: magic / dmg,
      tru: tru / dmg,
      tank: tank / minutes,
      cc: cc / minutes,
      roles: others ? Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v / others])) : {},
      others,
    });
  }

  const tanks = raws.map((r) => r.tank);
  const ccs = raws.map((r) => r.cc);
  return new Map(
    raws.map((r) => [
      r.id,
      {
        championId: r.id,
        samples: r.n,
        physicalShare: r.phys,
        magicShare: r.magic,
        trueShare: r.tru,
        frontline: percentile(r.tank, tanks),
        engage: percentile(r.cc, ccs),
        roleShares: r.roles,
        roleSamples: r.others,
      },
    ]),
  );
}
