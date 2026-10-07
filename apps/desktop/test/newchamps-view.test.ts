import { describe, expect, it } from "vitest";
import type { NewChampAdvice, NewChampion } from "@ldc/engine";
import { findConfigDir, loadConfig } from "../src/main/config";
import { newChampsView } from "../src/main/newchamps-view";

const config = loadConfig(findConfigDir(__dirname));
const NAMES: Record<number, string> = { 99: "Lux", 103: "Ahri", 245: "Ekko" };
const deps = {
  explain: config.explain,
  champion: (id: number) => (NAMES[id] ? { id, name: NAMES[id]!, iconUrl: null } : null),
  championName: (id: number) => NAMES[id] ?? `#${id}`,
  coreItems: (id: number) => (id === 99 ? ["Luden's Companion", "Shadowflame"] : []),
  planGames: [3, 5] as [number, number],
  focus: "CS per minute",
};
const pick = (championId: number, over: Partial<NewChampion> = {}): NewChampion => ({
  championId,
  fit: 1,
  parts: { similarity: 0.6, gap: 0, meta: 0.5, ease: 0.7, overlap: 0 },
  like: 103,
  winRate: 0.524,
  games: 1800,
  ease: 1,
  owned: false,
  covers: [],
  reasons: [
    { id: "newchamp.like", slots: { like: 103 } },
    { id: "newchamp.notOwned", slots: {} },
  ],
  ...over,
});

describe("new champions view", () => {
  it("shows each pick with its numbers and the first-games plan for the top one", () => {
    const a: NewChampAdvice = { role: "middle", picks: [pick(99), pick(245, { ease: 3, owned: true, like: null })], learning: null };
    const v = newChampsView(a, deps);
    expect(v.picks.map((p) => [p.champion.name, p.like?.name ?? null, p.easeLabel, p.owned])).toEqual([["Lux", "Ahri", "Easy", false], ["Ekko", null, "Hard", true]]);
    expect(v.picks[0]!.reasons).toEqual(["You don't own it yet"]);
    expect(v.plan).toBe("Try Lux in 3 to 5 Normal Draft games: Luden's Companion, then Shadowflame. Keep your focus on CS per minute.");
    expect(v.learning).toBeNull();
  });

  it("says when you're already learning a champion in the role", () => {
    const v = newChampsView({ role: "middle", picks: [], learning: 245 }, { ...deps, focus: null });
    expect(v.learning).toBe("Learning Ekko: one new champion per role at a time");
    expect(v.plan).toBeNull();
  });
});
