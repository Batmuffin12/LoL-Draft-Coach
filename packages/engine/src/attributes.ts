import type { ChampionId } from "@ldc/shared";
import { percentile } from "./comfort";
import type { AttributeSample, ChampionAttributes } from "./types";

/** Running sums for one champion's attributes (lets large data sets be streamed). */
export interface AttributeTotals {
  championId: ChampionId;
  n: number;
  physical: number;
  magic: number;
  true: number;
  /** Damage taken + self-mitigated. */
  tank: number;
  ccSeconds: number;
  minutes: number;
  /** Healing, over the samples that carried it. */
  heal: number;
  healN: number;
  healMinutes: number;
  /** Other players' samples per position (the player's own excluded). */
  roles: Record<string, number>;
  others: number;
}

/** Adds one sample to the totals map. */
export function addAttributeSample(totals: Map<ChampionId, AttributeTotals>, s: AttributeSample): void {
  let t = totals.get(s.championId);
  if (!t) {
    t = { championId: s.championId, n: 0, physical: 0, magic: 0, true: 0, tank: 0, ccSeconds: 0, minutes: 0, heal: 0, healN: 0, healMinutes: 0, roles: {}, others: 0 };
    totals.set(s.championId, t);
  }
  t.n++;
  t.physical += s.physicalDamage;
  t.magic += s.magicDamage;
  t.true += s.trueDamage;
  t.tank += s.damageTaken + s.selfMitigated;
  t.ccSeconds += s.ccSeconds;
  t.minutes += Math.max(1, s.durationSec / 60);
  if (s.heal !== undefined) {
    t.heal += s.heal;
    t.healN++;
    t.healMinutes += Math.max(1, s.durationSec / 60);
  }
  if (!s.self) {
    t.others++;
    if (s.position) t.roles[s.position] = (t.roles[s.position] ?? 0) + 1;
  }
}

/**
 * Champion attributes from accumulated totals. Champions with fewer than `minSamples`
 * samples are left out ("not enough data"); frontline and engage are percentiles among
 * the champions that remain.
 */
export function attributesFromTotals(totals: Iterable<AttributeTotals>, minSamples: number): Map<ChampionId, ChampionAttributes> {
  const raws = [...totals]
    .filter((t) => t.n >= minSamples)
    .map((t) => {
      const dmg = t.physical + t.magic + t.true || 1;
      return {
        t,
        phys: t.physical / dmg,
        magic: t.magic / dmg,
        tru: t.true / dmg,
        tank: t.tank / t.minutes,
        cc: t.ccSeconds / t.minutes,
        heal: t.healN >= minSamples ? t.heal / t.healMinutes : null,
      };
    });
  const tanks = raws.map((r) => r.tank);
  const ccs = raws.map((r) => r.cc);
  const heals = raws.flatMap((r) => (r.heal === null ? [] : [r.heal]));
  return new Map(
    raws.map((r) => [
      r.t.championId,
      {
        championId: r.t.championId,
        samples: r.t.n,
        physicalShare: r.phys,
        magicShare: r.magic,
        trueShare: r.tru,
        frontline: percentile(r.tank, tanks),
        engage: percentile(r.cc, ccs),
        ...(r.heal === null ? {} : { heal: percentile(r.heal, heals) }),
        roleShares: r.t.others ? Object.fromEntries(Object.entries(r.t.roles).map(([k, v]) => [k, v / r.t.others])) : {},
        roleSamples: r.t.others,
      },
    ]),
  );
}

/**
 * Derives champion attributes from match participants, as the spec requires
 * (measured, not labelled):
 * - damage type: share of physical / magic / true damage to champions
 * - frontline: (damage taken + self-mitigated) per minute, as a percentile
 * - engage/CC: seconds of CC on others per minute, as a percentile
 * - healing (self and allies) per minute, as a percentile, when matches kept it
 * - roles: share of samples per position
 * Champions with fewer than `minSamples` samples are left out ("not enough data").
 */
export function deriveChampionAttributes(samples: AttributeSample[], minSamples: number): Map<ChampionId, ChampionAttributes> {
  const totals = new Map<ChampionId, AttributeTotals>();
  for (const s of samples) addAttributeSample(totals, s);
  return attributesFromTotals(totals.values(), minSamples);
}
