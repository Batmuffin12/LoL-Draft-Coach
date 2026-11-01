import { describe, expect, it, vi } from "vitest";
import type { Loadout } from "@ldc/engine";
import { LcuWriteError } from "@ldc/lcu";
import { findConfigDir, loadConfig } from "../src/main/config";
import { reportProblem } from "../src/main/crash-reports";
import { importLoadout, importShownLoadout, type LoadoutWriter } from "../src/main/loadout-import";

vi.mock("../src/main/crash-reports", () => ({ reportProblem: vi.fn() }));
const config = loadConfig(findConfigDir(__dirname));

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

  it("says which part failed in plain words, and reports the technical detail", async () => {
    const report = vi.fn();
    const raw = new LcuWriteError("LCU PATCH /lol-champ-select/v1/session/my-selection failed with HTTP 500", 500, "failed");
    const { w, calls } = writer({ importSpells: async () => Promise.reject(raw) });
    const msg = await importLoadout("runes", { loadout, champion: "Ahri" }, w, { say, mapId: 11, report });
    expect(msg).toBe("import.runes.created · import.failed.spells");
    expect(calls).toHaveLength(1);
    expect(report.mock.calls[0]![0]).toMatch(/HTTP 500/);
  });

  it("writes no empty item set", async () => {
    const { w, calls } = writer();
    const empty = { ...loadout, starting: null, boots: null, core: null, items: [], situational: [] } as unknown as Loadout;
    expect(await importLoadout("items", { loadout: empty, champion: "Ahri" }, w, { say, mapId: 11 })).toBe("");
    expect(calls).toEqual([]);
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

describe("importShownLoadout: every click ends in a message", () => {
  const shown = { loadout, champion: "Ahri" };
  const full = (over: Partial<LoadoutWriter> = {}) => ({ ...writer(over).w, close: vi.fn() });

  it("reports success, from the config's wording, and closes the writer", async () => {
    const w = full();
    expect(await importShownLoadout("all", shown, w, config)).toEqual({
      message: "Rune page created in your client · Summoner spells set · Item set saved: open the shop in game to see it",
      failed: false,
    });
    expect(w.close).toHaveBeenCalled();
  });

  it("marks a failure, without any raw error in the message", async () => {
    vi.mocked(reportProblem).mockClear();
    const w = full({ importItemSet: async () => Promise.reject(new LcuWriteError("LCU GET /lol-summoner/v1/current-summoner failed with HTTP 500", 500, "failed")) });
    const r = await importShownLoadout("items", shown, w, config);
    expect(r).toEqual({ message: "Couldn't save the item set: try again", failed: true });
    expect(vi.mocked(reportProblem).mock.calls[0]![0]).toMatch(/current-summoner/);
  });

  it("marks full rune pages as a failure too, even though the spells worked", async () => {
    const r = await importShownLoadout("runes", shown, full({ importRunePage: async () => Promise.reject(new LcuWriteError("full", 400, "pagesFull")) }), config);
    expect(r.failed).toBe(true);
    expect(r.message).toContain("rune pages are in use");
  });

  it("says so when there was nothing to write, rather than nothing at all", async () => {
    const empty = { loadout: { ...loadout, page: null, spells: null } as unknown as Loadout, champion: "Ahri" };
    expect(await importShownLoadout("runes", empty, full(), config)).toEqual({ message: "Nothing to import for this champion yet", failed: true });
  });
});
