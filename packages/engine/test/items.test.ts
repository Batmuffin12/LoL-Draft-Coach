import { describe, expect, it } from "vitest";
import type { ChampionAttributes, ItemInfo } from "@ldc/shared";
import { completedItems, deriveChampionAttributes, teamTraits, traitCutsFrom } from "../src/index";

const item = (id: number, over: Partial<ItemInfo> = {}): ItemInfo => ({
  id,
  name: `Item ${id}`,
  iconUrl: "",
  gold: 3000,
  into: [],
  from: [],
  tags: [],
  maps: ["11"],
  purchasable: true,
  requiredChampion: null,
  stats: {},
  ...over,
});

describe("completed items (derived from Data Dragon)", () => {
  const catalog = new Map(
    [
      item(1001, { gold: 300, into: [3006], tags: ["Boots"] }),
      item(3006, { gold: 1100, from: [1001], into: [3172], tags: ["Boots"] }),
      item(3172, { gold: 1600, from: [3006], tags: ["Boots"] }), // upgraded boots: not a new slot
      item(1036, { gold: 350, into: [3071] }),
      item(3071, { from: [1036] }),
      item(3003, { into: [3040] }), // builds only into a champion-only upgrade
      item(3040, { requiredChampion: "Ryze", purchasable: false }),
      item(2003, { gold: 50 }),
      item(3152, { maps: ["12"] }), // not on Summoner's Rift
      item(3901, { purchasable: false }),
    ].map((i) => [i.id, i]),
  );

  it("counts legendaries and upgraded boots, never components, consumables, other maps or champion-only items", () => {
    expect([...completedItems(catalog, { mapId: "11", legendaryMinGold: 2000 })].sort()).toEqual([3003, 3006, 3071]);
  });
});

describe("enemy traits", () => {
  const a = (championId: number, magicShare: number, heal?: number): ChampionAttributes => ({
    championId,
    samples: 50,
    physicalShare: 1 - magicShare,
    magicShare,
    trueShare: 0,
    frontline: 0.5,
    engage: 0.5,
    ...(heal === undefined ? {} : { heal }),
    roleShares: {},
    roleSamples: 50,
  });
  const attrs = new Map([a(1, 0.2, 0.9), a(2, 0.8), a(3, 0.5, 0.1)].map((x) => [x.championId, x]));

  it("averages the known enemies, and cuts at the band's games-weighted average", () => {
    expect(teamTraits([1, 2, 99], attrs)).toMatchObject({ magic: 0.5, heal: 0.9 });
    const cuts = traitCutsFrom([{ championId: 1, games: 3 }, { championId: 2, games: 1 }], attrs);
    expect(cuts.magic).toBeCloseTo(0.35);
    expect(cuts.heal).toBeCloseTo(0.9);
  });

  it("measures healing per minute as a percentile when matches carry it", () => {
    const s = (championId: number, heal?: number) => ({
      championId, position: "top", physicalDamage: 1, magicDamage: 0, trueDamage: 0, damageTaken: 1, selfMitigated: 0, ccSeconds: 0, durationSec: 1800, ...(heal === undefined ? {} : { heal }),
    });
    const m = deriveChampionAttributes([s(1, 9000), s(1, 9000), s(2, 100), s(2, 100), s(3), s(3)], 2);
    expect(m.get(1)!.heal).toBeGreaterThan(m.get(2)!.heal!);
    expect(m.get(3)!.heal).toBeUndefined();
  });
});
