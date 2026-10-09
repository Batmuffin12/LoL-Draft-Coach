import { describe, expect, it } from "vitest";
import type { StaticData } from "@ldc/ddragon";
import type { Loadout } from "@ldc/engine";
import { findConfigDir, loadConfig } from "../src/main/config";
import { groupRepeats, runeTree, shardRowsView, toLoadoutView } from "../src/main/loadout-view";

const config = loadConfig(findConfigDir(__dirname));

/** Two rune paths as Data Dragon lists them (slot 0 = keystones), and two items. */
const runes = [
  { id: 8100, key: "Domination", name: "Domination", icon: "d.png", slots: [{ runes: [{ id: 8112, name: "Electrocute", icon: "" }, { id: 8128, name: "Dark Harvest", icon: "" }] }, { runes: [{ id: 8126, name: "Cheap Shot", icon: "" }, { id: 8139, name: "Taste of Blood", icon: "" }] }] },
  { id: 8200, key: "Sorcery", name: "Sorcery", icon: "s.png", slots: [{ runes: [{ id: 8214, name: "Summon Aery", icon: "" }] }, { runes: [{ id: 8226, name: "Manaflow Band", icon: "" }] }, { runes: [{ id: 8210, name: "Transcendence", icon: "" }] }] },
];
const runeInfo = new Map(runes.flatMap((s) => [{ id: s.id, name: s.name, styleId: s.id }, ...s.slots.flatMap((sl) => sl.runes.map((r) => ({ id: r.id, name: r.name, styleId: s.id })))]).map((r) => [r.id, { ...r, iconUrl: `img/${r.id}.png` }]));
const item = (id: number, name: string) => [id, { id, name, iconUrl: `img/${id}.png`, gold: 0, into: [], from: [] }] as const;
const data = {
  version: "16.19.1",
  locale: "en_US",
  champions: new Map(),
  itemInfo: new Map([item(1056, "Doran's Ring"), item(2003, "Health Potion"), item(6655, "Luden's Companion"), item(3020, "Sorcerer's Shoes")]),
  runeInfo,
  spellInfo: new Map(),
  runes,
} as unknown as StaticData;

const ranked = (itemId: number, share: number, winAdded: number, minute: number) => ({ itemId, slot: 1, score: 0, winAdded, situational: 0, n: 200, share, minute, reasons: [] });
const loadout = (thin: boolean): Loadout => ({
  championId: 103,
  role: "middle",
  games: 2000,
  source: { games: 2000, roleGames: 2000, pooled: false, personalGames: 0, thin },
  page: { value: { primaryStyle: 8100, subStyle: 8200, runes: [8112, 8139, 8226, 8210], statPerks: [5011, 5008, 5005], games: 900, wins: 480, n: 900 }, winRate: 0.532, n: 900, reasons: [] },
  situationalRunes: [],
  spells: { value: [4, 14], winRate: 0.528, n: 1870, reasons: [] },
  skills: { value: { first: [1, 3, 2], order: [1, 2, 3] }, winRate: 0.531, n: 1980, reasons: [] },
  starting: { value: [1056, 2003, 2003], winRate: 0, n: 300, reasons: [] },
  boots: { top: ranked(3020, 0.61, 0.006, 14), alternatives: [] },
  quest: [],
  laterPool: [],
  situational: [],
  core: { value: [6655], winRate: 0, n: 200, reasons: [] },
  spikes: [{ itemId: 6655, n: 400, gold: 31 }],
  items: [{ slot: 1, minute: 11.4, top: ranked(6655, 0.58, 0.014, 11), alternatives: [] }],
});
const view = (thin: boolean, shardRows?: number[][]) =>
  toLoadoutView(loadout(thin), {
    data,
    templates: config.explain.templates,
    championName: () => "Ahri",
    bands: config.bands,
    band: config.bands.defaultBand,
    canImport: false,
    perk: (id) => ({ name: `Shard ${id}`, iconUrl: null }),
    ...(shardRows ? { shardRows } : {}),
  });

describe("rune trees", () => {
  it("draws the primary path with its keystones and the secondary path without", () => {
    const p = runeTree(data, 8100, false)!;
    expect(p.style.name).toBe("Domination");
    expect(p.rows.map((r) => r.map((x) => x.name))).toEqual([["Electrocute", "Dark Harvest"], ["Cheap Shot", "Taste of Blood"]]);
    expect(runeTree(data, 8200, true)!.rows.map((r) => r.map((x) => x.id))).toEqual([[8226], [8210]]);
    expect(runeTree(data, 9999, false)).toBeNull();
    expect(runeTree(null, 8100, false)).toBeNull();
  });

  it("marks the chosen shard in each row, in the client's order", () => {
    const s = shardRowsView([[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]], [5005, 5008, 5011], (id) => ({ name: `S${id}`, iconUrl: null }))!;
    expect(s.chosen).toEqual([1, 0, 0]);
    expect(s.rows[0]![1]!.name).toBe("S5005");
    expect(shardRowsView([], [5005], undefined)).toBeNull();
  });

  it("groups repeated starting items", () => {
    expect(groupRepeats([1056, 2003, 2003])).toEqual({ ids: [1056, 2003], counts: [1, 2] });
  });
});

describe("situational runes", () => {
  it("suggests swapping in only runes from the shown page's two trees", () => {
    // 8139 is in Domination (the page's primary); 9999 is in neither tree (another page).
    const l = { ...loadout(false), situationalRunes: [8139, 9999].map((runeId) => ({ runeId, trait: "engage" as const, lift: 2, games: 300, reasons: [] })) };
    const deps = { data, templates: config.explain.templates, championName: () => "Ahri", bands: config.bands, band: config.bands.defaultBand, canImport: false };
    expect(toLoadoutView(l, deps).situationalRunes.map((r) => r.id)).toEqual([8139]);
    // Without rune data the trees are unknown: nothing is filtered.
    expect(toLoadoutView(l, { ...deps, data: null }).situationalRunes).toHaveLength(2);
  });

  it("with mechanic rules, keeps a swap only when the rune's own text answers the trait, and says why", () => {
    const withText = {
      ...data,
      runes: data.runes.map((s) => ({
        ...s,
        slots: s.slots.map((sl) => ({ runes: sl.runes.map((r) => (r.id === 8139 ? { ...r, shortDesc: "Gain Armor and <b>Magic Resist</b> when receiving crowd control." } : { ...r, shortDesc: "Heal when you damage an enemy champion." })) })),
      })),
    } as unknown as typeof data;
    const swap = (runeId: number, trait: "engage" | "heal") => ({ runeId, trait, lift: 2.1, games: 340, reasons: [] });
    const l = { ...loadout(false), situationalRunes: [swap(8139, "engage"), swap(8126, "engage"), swap(8139, "heal")] };
    const deps = { data: withText, templates: config.explain.templates, championName: () => "Ahri", bands: config.bands, band: config.bands.defaultBand, canImport: false, runeMechanics: config.engine.loadout.runeMechanics };
    const v = toLoadoutView(l, deps).situationalRunes;
    expect(v.map((r) => r.id)).toEqual([8139]); // Cheap Shot's text doesn't answer crowd control; no rule for heal
    expect(v[0]!.reasons).toEqual([
      "Their team has a lot of crowd control. Taste of Blood: Gain Armor and Magic Resist when receiving crowd control.",
      "Players take it 2.1× as often into teams like this (340 games)",
    ]);
  });
});

describe("situational items", () => {
  it("keeps an item against this team only when its own text answers the trait, and says why", () => {
    const withItems = {
      ...data,
      itemInfo: new Map<number, unknown>([...data.itemInfo, item(3033, "Mortal Reminder"), item(3020, "Sorcerer's Shoes")]),
      items: {
        "3033": { description: "<stats>35 Attack Damage</stats><passive>Grievous Wounds</passive> applies 40% <keyword>Wounds</keyword>" },
        "3020": { description: "<stats>12 Magic Penetration</stats>" },
      },
    } as unknown as typeof data;
    const s = (itemId: number, trait: "heal" | "magic") => ({ itemId, trait, lift: 1.9, games: 420, reasons: [] });
    const l = { ...loadout(false), situational: [s(3033, "heal"), s(3020, "heal"), s(3020, "magic")] };
    const deps = { data: withItems, templates: config.explain.templates, championName: () => "Ahri", bands: config.bands, band: config.bands.defaultBand, canImport: false, itemMechanics: config.engine.loadout.itemMechanics };
    const v = toLoadoutView(l, deps).situational;
    expect(v.map((x) => x.id)).toEqual([3033]); // Sorcerer's Shoes neither cuts healing nor gives magic resist
    expect(v[0]!.reasons).toEqual(["Their team heals a lot: Mortal Reminder cuts their healing (Wounds)", "Players buy it 1.9× as often into teams like this (420 games)"]);
  });
});

describe("toLoadoutView numbers", () => {
  it("carries win rate and games on every choice, the slot minute, and share and win added on items", () => {
    const v = view(false, [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]]);
    expect(v.page).toMatchObject({ winRate: 0.532, games: 900 });
    expect(v.page!.primaryTree!.rows[0]!.map((r) => r.name)).toEqual(["Electrocute", "Dark Harvest"]);
    expect(v.page!.secondaryTree!.style.name).toBe("Sorcery");
    // statPerks are stored defense, flex, offense: shown offense first.
    expect(v.page!.shardRows!.chosen).toEqual([1, 0, 0]);
    expect(v.spells).toMatchObject({ winRate: 0.528, games: 1870 });
    expect(v.skills).toMatchObject({ first: ["Q", "E", "W"], order: ["Q", "W", "E"], basic: ["Q", "W", "E"], ult: "R", winRate: 0.531, games: 1980 });
    // The starting choice has no win rate of its own (0): none is shown.
    expect(v.starting).toMatchObject({ counts: [1, 2], winRate: null, games: 300 });
    expect(v.starting!.items.map((i) => i.name)).toEqual(["Doran's Ring", "Health Potion"]);
    expect(v.items[0]).toMatchObject({ minute: 11.4, top: { name: "Luden's Companion", share: 0.58, winAdded: 0.014 } });
    expect(v.boots!.top).toMatchObject({ share: 0.61, winAdded: 0.006 });
    // A measured power spike says so on its item; other items don't.
    expect(v.items[0]!.top.spike).toBe("Power spike: after finishing it first, Ahri pulls ahead of the lane opponent by about 31 more gold a minute than after a typical first item (400 games)");
    expect(v.boots!.top.spike).toBeNull();
  });

  it("quotes no win rates with thin data (D31), but keeps games and shares", () => {
    const v = view(true);
    expect(v.page).toMatchObject({ winRate: null, games: 900, shardRows: null });
    expect(v.spells!.winRate).toBeNull();
    expect(v.skills!.winRate).toBeNull();
    expect(v.items[0]!.top).toMatchObject({ share: 0.58, winAdded: null });
    expect(v.boots!.top.winAdded).toBeNull();
  });
});
