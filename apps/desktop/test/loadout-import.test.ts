import { describe, expect, it } from "vitest";
import type { Loadout } from "@ldc/engine";
import { LcuWriteError } from "@ldc/lcu";
import { importLoadout, type LoadoutWriter } from "../src/main/loadout-import";

const say = (id: string, slots: Record<string, string | number> = {}) => (Object.keys(slots).length ? `${id}(${Object.values(slots).join(",")})` : id);

const loadout = {
  championId: 103,
  role: "middle",
  page: { value: { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8138, 8135, 8226, 8210], statPerks: [5001, 5008, 5005] } },
  spells: { value: [4, 14] },
  starting: { value: [1056, 2003] },
  boots: { top: { itemId: 3020 }, alternatives: [{ itemId: 3158 }] },
  core: { value: [6655, 4645, 3157, 3089] },
  items: [{ alternatives: [{ itemId: 3165 }, { itemId: 6655 }] }],
  laterPool: [],
  situational: [{ trait: "heal", itemId: 3165 }],
} as unknown as Loadout;

function writer(over: Partial<LoadoutWriter> = {}) {
  const calls: unknown[] = [];
  const w: LoadoutWriter = {
    importRunePage: async (page) => (calls.push(["page", page]), "created"),
    importSpells: async (spells) => void calls.push(["spells", spells]),
    importItemSet: async (set) => void calls.push(["items", set]),
    ...over,
  };
  return { w, calls };
}

describe("importLoadout", () => {
  it("writes the rune page (shards in the client's order) and the spells, and says both", async () => {
    const { w, calls } = writer();
    const msg = await importLoadout("runes", { loadout, champion: "Ahri" }, w, { say, mapId: 11 });
    expect(msg).toBe("import.runes.created · import.spells.done");
    expect(calls[0]).toEqual(["page", { name: "Ahri", primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8138, 8135, 8226, 8210, 5005, 5008, 5001] }]);
    expect(calls[1]).toEqual(["spells", [4, 14]]);
  });

  it("still sets the spells when the rune pages are full", async () => {
    const { w, calls } = writer({ importRunePage: async () => Promise.reject(new LcuWriteError("full", 400, "pagesFull")) });
    expect(await importLoadout("runes", { loadout, champion: "Ahri" }, w, { say, mapId: 11 })).toBe("import.runes.full · import.spells.done");
    expect(calls).toEqual([["spells", [4, 14]]]);
  });

  it("writes one item set: start, boots, core, later, situational and the other options", async () => {
    const { w, calls } = writer();
    expect(await importLoadout("items", { loadout, champion: "Ahri" }, w, { say, mapId: 11 })).toBe("import.items.done");
    const set = (calls[0] as [string, { blocks: { type: string; items: number[] }[]; mapId: number }])[1];
    expect(set.mapId).toBe(11);
    expect(set.blocks.map((b) => [b.type, b.items])).toEqual([
      ["import.block.starting", [1056, 2003]],
      ["import.block.boots", [3020]],
      ["import.block.core", [6655, 4645, 3157]],
      ["import.block.later", [3089]],
      ["import.block.situational.heal", [3165]],
      ["import.block.alternatives", [3165, 3158]],
    ]);
  });
});
