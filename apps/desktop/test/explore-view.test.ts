import { createElement, type MutableRefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { StaticData } from "@ldc/ddragon";
import { MetaIndex, playerGame } from "@ldc/engine";
import type { ChampionBuild, MetaSnapshot, UserMatch } from "@ldc/shared";
import { exploreChampionView, exploreListView, memoByInputs, myGamesView, orderRoles, type ExploreChampionDeps } from "../src/main/explore-view";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy, roleLabels } from "../src/main/personal-coach";
import { browseEmptyKey, setCopy, setMinGames, setRoleLabels, shortDate, t } from "../src/renderer/format";
import { BrowseList, ChampionPage, type DetailTab } from "../src/renderer/screens/Browse";
import { MyGamesList } from "../src/renderer/screens/MyGames";
import { championRecords, exploreArgs, filterExplore, filterMyGames, kda, searchKey, type ExploreFilter, type ExploreRow } from "../src/shared/explore";

const config = loadConfig(findConfigDir(__dirname));
const labels = roleLabels(config.explain.templates);
const NAMES: Record<number, string> = { 1: "Ahri", 2: "Kai'Sa", 3: "Dr. Mundo", 4: "Nunu & Willump", 5: "Zed", 6: "Wukong" };
const lookup = (id: number) => (NAMES[id] ? { id, key: NAMES[id]!, name: NAMES[id]!, iconUrl: `icon/${id}.png` } : undefined);
const MIN = 10;

beforeAll(() => {
  setCopy(uiCopy(config.explain.templates));
  setRoleLabels(labels);
  setMinGames(MIN);
});

const page = (keystone: number, n: number, wins: number) => ({ primaryStyle: 8100, subStyle: 8200, runes: [keystone, 2, 3, 4, 5, 6], statPerks: [5008, 5008, 5011], games: n, wins, n });

const build = (over: Partial<ChampionBuild> = {}): ChampionBuild => ({
  championId: 1,
  role: "middle",
  n: 1000,
  timelineN: 800,
  games: 1000,
  wins: 520,
  pages: [page(8112, 600, 330), page(8128, 200, 90), page(8124, 2, 2)],
  spells: [{ spells: [4, 14], games: 900, wins: 470, n: 900 }],
  skills: [{ first: [1, 3, 2], order: [1, 2, 3], games: 700, wins: 360, n: 700 }],
  // Item choices with wins in the snapshot: 90% must never reach the panel.
  starting: [{ items: [1056, 2003], games: 600, wins: 540, n: 600 }],
  core: [{ items: [6655, 4645, 3157], games: 200, wins: 180, n: 200 }],
  items: [
    { itemId: 6655, slot: 1, n: 400, share: 0.58, winAdded: 0.014, minute: 11 },
    { itemId: 3118, slot: 1, n: 200, share: 0.27, winAdded: -0.004, minute: 12 },
    { itemId: 4645, slot: 2, n: 300, share: 0.44, winAdded: 0.009, minute: 18 },
  ],
  lifts: [],
  matchupPages: [],
  ...over,
});

const champ = (championId: number, role: string, n: number, wins: number) => ({ championId, role, games: n, wins, n });

const snapshot = (over: Partial<MetaSnapshot> = {}): MetaSnapshot => ({
  format: 1,
  band: 2,
  createdAt: 1000,
  patch: "16.19",
  matches: 10_000,
  newestMatchAt: null,
  halfLifeDays: 14,
  roleGames: { middle: 20_000, top: 20_000 },
  champions: [champ(1, "middle", 1000, 520), champ(5, "middle", 1200, 590), champ(2, "middle", 3, 3), champ(1, "top", 50, 24), champ(3, "top", 900, 470), champ(4, "", 40, 20)],
  bans: [{ championId: 5, bans: 2100, n: 2100 }],
  banMatches: 10_000,
  matchups: [
    [1, "middle", 5, "middle", 400, 240, 400],
    [1, "middle", 2, "middle", 300, 110, 300],
    [1, "middle", 6, "middle", 4, 4, 4],
  ],
  duos: [],
  attributes: [],
  builds: [build()],
  references: {},
  ...over,
});

const index = (over: Partial<MetaSnapshot> = {}) => new MetaIndex(snapshot(over), config.engine.rating);

const seat = (championId: number, position: string, win: boolean) => ({ championId, position, win, teamId: 100, kills: 5, deaths: 2, assists: 7, cs: 180, gold: 0, visionScore: 0, physicalDamage: 0, magicDamage: 0, trueDamage: 0, damageTaken: 0, selfMitigated: 0, ccSeconds: 0, objectiveDamage: 0, items: [], spells: [], perks: null, challenges: {} });
const myMatch = (i: number, championId: number, position: string, win: boolean): UserMatch => ({
  me: 1,
  match: { matchId: `M_${i}`, queueId: 420, gameVersion: "16.19", endedAt: 1_000_000 + i, durationSec: 1800, participants: [seat(6, "top", !win), seat(championId, position, win)] },
});
const matches = [myMatch(1, 1, "middle", true), myMatch(2, 1, "middle", false), myMatch(3, 1, "top", true), myMatch(4, 5, "middle", true)];
const own = matches.map(playerGame).filter((g) => g !== null);

const listDeps = { games: own, lookup, bands: config.bands, roleLabels: labels };
const row = (over: Partial<ExploreRow> & { id: number }): ExploreRow => ({ name: NAMES[over.id] ?? "x", iconUrl: null, role: "middle", games: 500, winRate: 0.5, pickRate: 0.1, banRate: 0.05, yours: null, ...over });
const filter = (over: Partial<ExploreFilter> = {}): ExploreFilter => ({ search: "", role: "", sort: "winRate", ...over });

const item = (id: number, name: string) => [id, { id, name, iconUrl: `img/${id}.png`, gold: 0, into: [], from: [], tags: [], maps: [], purchasable: true, requiredChampion: null, stats: {} }] as const;
const data = {
  version: "16.19.1",
  locale: "en_US",
  champions: new Map(),
  itemInfo: new Map([item(1056, "Doran's Ring"), item(2003, "Health Potion"), item(6655, "Luden's Companion"), item(3118, "Malignance"), item(4645, "Shadowflame"), item(3157, "Zhonya's Hourglass")]),
  runeInfo: new Map([[8112, { id: 8112, name: "Electrocute", iconUrl: "e.png", styleId: 8100 }], [8128, { id: 8128, name: "Dark Harvest", iconUrl: "d.png", styleId: 8100 }]]),
  spellInfo: new Map(),
  runes: [],
} as unknown as StaticData;

const detailDeps: ExploreChampionDeps = {
  games: own,
  lookup,
  loadout: config.engine.loadout,
  minGames: MIN,
  data,
  templates: config.explain.templates,
  championName: (id) => NAMES[id] ?? `#${id}`,
  bands: config.bands,
};

describe("the list of champions", () => {
  it("has one row per champion-role, with the snapshot's numbers and your games on it", () => {
    const list = exploreListView(index(), listDeps);
    expect(list.rows.map((r) => `${r.id}|${r.role}`)).toEqual(["1|middle", "5|middle", "2|middle", "1|top", "3|top"]);
    const zed = list.rows.find((r) => r.id === 5)!;
    expect(zed.winRate).toBeCloseTo(590 / 1200);
    expect(zed.pickRate).toBeCloseTo(1200 / 10_000);
    expect(zed.banRate).toBeCloseTo(0.21);
    expect(zed.games).toBe(1200);
    expect(zed.yours).toEqual({ games: 1, wins: 1 });
    expect(list.rows.find((r) => r.id === 1 && r.role === "middle")!.yours).toEqual({ games: 2, wins: 1 });
    expect(list.rows.find((r) => r.id === 3)!.yours).toBeNull();
    expect(list.rows.find((r) => r.id === 3)!.banRate).toBe(0);
  });

  it("says which rank in words, never a band number", () => {
    const list = exploreListView(index(), listDeps);
    expect(list.rank).toBe("Gold to Platinum");
    expect(list.roles).toEqual(["top", "middle"]);
  });

  it("copes with an older snapshot: no bans, no builds", () => {
    const old = exploreListView(index({ bans: undefined, banMatches: undefined, builds: undefined } as Partial<MetaSnapshot>), listDeps);
    expect(old.hasBans).toBe(false);
    expect(old.rows.every((r) => r.banRate === null)).toBe(true);
  });

  it("has no pick rate for a role the snapshot has no games for, instead of a false 0%", () => {
    const list = exploreListView(index({ roleGames: { middle: 20_000 } }), listDeps);
    expect(list.rows.find((r) => r.id === 3)!.pickRate).toBeNull();
  });

  it("is worked out once per snapshot and history", () => {
    const memo = memoByInputs<object>();
    const [a, b] = [{}, {}];
    const first = memo([a, b], () => ({}));
    expect(memo([a, b], () => ({}))).toBe(first);
    expect(memo([a, {}], () => ({}))).not.toBe(first);
  });

  it("orders roles the way the config lists them, then any others", () => {
    expect(orderRoles(["utility", "middle", "new", ""], labels)).toEqual(["middle", "utility", "new"]);
  });
});

describe("search, role and sort", () => {
  const rows = [row({ id: 1 }), row({ id: 2 }), row({ id: 3 }), row({ id: 4, role: "jungle" })];
  const names = (f: Partial<ExploreFilter>) => filterExplore(rows, filter(f), MIN).map((r) => r.name);

  it("finds names whatever the case, spaces or punctuation", () => {
    expect(names({ search: "kaisa" })).toEqual(["Kai'Sa"]);
    expect(names({ search: "KAI'SA" })).toEqual(["Kai'Sa"]);
    expect(names({ search: "dr mundo" })).toEqual(["Dr. Mundo"]);
    expect(names({ search: "drmundo" })).toEqual(["Dr. Mundo"]);
    expect(names({ search: "nunu & w" })).toEqual(["Nunu & Willump"]);
    expect(searchKey("Renée")).toBe("renee");
  });

  it("a search of only punctuation doesn't hide everything; no match gives no rows", () => {
    expect(names({ search: " '. " })).toHaveLength(4);
    expect(names({ search: "zzz" })).toEqual([]);
  });

  it("filters by role, and a role with no data gives no rows", () => {
    expect(names({ role: "jungle" })).toEqual(["Nunu & Willump"]);
    expect(names({ role: "top" })).toEqual([]);
  });

  it("sorts by each number, highest first; missing numbers last", () => {
    const list = [row({ id: 1, winRate: 0.5, pickRate: 0.2, banRate: null }), row({ id: 2, winRate: 0.55, pickRate: null, banRate: 0.3 }), row({ id: 3, winRate: 0.45, pickRate: 0.1, banRate: 0.1, yours: { games: 4, wins: 1 } })];
    const ids = (sort: ExploreFilter["sort"]) => filterExplore(list, filter({ sort }), MIN).map((r) => r.id);
    expect(ids("winRate")).toEqual([2, 1, 3]);
    expect(ids("pickRate")).toEqual([1, 3, 2]);
    expect(ids("banRate")).toEqual([2, 3, 1]);
    expect(ids("yours")[0]).toBe(3);
  });

  it("by win rate, thin rows come after every solid one: 100% from one game isn't the strongest", () => {
    const list = [row({ id: 1, winRate: 1, games: 1 }), row({ id: 2, winRate: 0.4, games: 500 }), row({ id: 3, winRate: 0.5, games: MIN })];
    expect(filterExplore(list, filter(), MIN).map((r) => r.id)).toEqual([3, 2, 1]);
    expect(filterExplore(list, filter({ sort: "pickRate" }), MIN)[0]!.games).toBe(500);
  });

  it("leaves the list it was given alone", () => {
    const before = rows.map((r) => r.id);
    filterExplore(rows, filter({ search: "a" }), MIN);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("the IPC arguments", () => {
  it("takes a champion id and a role, and nothing else", () => {
    expect(exploreArgs(103, "middle")).toEqual({ championId: 103, role: "middle" });
    for (const bad of [[0, "middle"], [-1, "middle"], [1.5, "middle"], ["103", "middle"], [Number.NaN, "middle"], [null, "middle"], [103, ""], [103, 5], [103, null], [103, "x".repeat(33)], [undefined, undefined], [{ id: 1 }, []]]) {
      expect(exploreArgs(bad[0], bad[1])).toBeNull();
    }
  });
});

describe("a champion looked up", () => {
  const view = () => exploreChampionView(index(), 1, "middle", detailDeps)!;

  it("matches the snapshot, with your record in this role only", () => {
    const v = view();
    expect(v.winRate).toBeCloseTo(0.52);
    expect(v.pickRate).toBeCloseTo(0.1);
    expect(v.banRate).toBe(0);
    expect(v.games).toBe(1000);
    expect(v.yours).toEqual({ games: 2, wins: 1 });
    expect(v.rank).toBe("Gold to Platinum");
  });

  it("is null for a champion-role the snapshot doesn't have", () => {
    expect(exploreChampionView(index(), 1, "utility", detailDeps)).toBeNull();
    expect(exploreChampionView(index(), 999, "middle", detailDeps)).toBeNull();
  });

  it("names rune pages by keystone with their share and win rate, leaving out pages from too few games", () => {
    const { pages } = view();
    expect(pages.map((p) => p.optionLabel)).toEqual(["Electrocute", "Dark Harvest"]);
    expect(pages[0]!.share).toBeCloseTo(0.6);
    expect(pages[0]!.winRate).toBeCloseTo(0.55);
    expect(pages[0]!.games).toBe(600);
    expect(pages[0]!.situationalRunes).toEqual([]);
  });

  it("quotes no rune win rates with thin data", () => {
    const thin = build({ n: 40, games: 40, wins: 20, timelineN: 30, pages: [page(8112, 30, 20), page(8128, 10, 5)] });
    const v = exploreChampionView(index({ builds: [thin] }), 1, "middle", detailDeps)!;
    expect(v.pages[0]!.winRate).toBeNull();
    expect(v.loadout!.thinNote).toBeTruthy();
  });

  it("no raw item win rate reaches the view: items carry pick rate and win added only", () => {
    const { loadout, core } = view();
    expect(loadout!.starting!.winRate).toBeNull();
    expect(core).toEqual({ items: expect.any(Array), share: 200 / 800, games: 200 });
    expect(core).not.toHaveProperty("winRate");
    const options = [...loadout!.items.flatMap((s) => [s.top, ...s.alternatives]), ...(loadout!.boots ? [loadout!.boots.top] : [])];
    expect(options.length).toBeGreaterThan(0);
    const allowed = ["id", "name", "iconUrl", "reasons", "share", "winAdded"];
    for (const o of options) expect(Object.keys(o).filter((k) => !allowed.includes(k))).toEqual([]);
    const build1 = options.find((o) => o.id === 6655)!;
    expect(build1.share).toBeCloseTo(0.58);
    expect(build1.winAdded).toBeCloseTo(0.014);
    // Wins in the snapshot's item choices were 90%: no such number anywhere in the items' part of the view.
    const items = JSON.stringify({ items: loadout!.items, boots: loadout!.boots, starting: loadout!.starting, commonPath: loadout!.commonPath, quest: loadout!.quest, later: loadout!.laterPool, core });
    expect(items).not.toMatch(/"wins"|90%|"winRate":0/);
  });

  it("the Build tab as drawn shows pick rate and win added, and no item win rate", () => {
    const html = renderToStaticMarkup(createElement(ChampionPage, { view: view(), tab: "build" as DetailTab, onTab: () => {}, onBack: () => {} }));
    expect(html).toContain("Luden&#x27;s Companion");
    expect(html).toContain("58%");
    expect(html).toContain("+1.4");
    expect(html).toContain("−0.4");
    expect(html).toContain(t("explore.core"));
    expect(html).not.toContain("90%");
    expect(html).not.toMatch(/import/i);
  });

  it("best and worst matchups from enough games, with counts; thin pairs stay out", () => {
    const { best, worst } = view().matchups;
    expect(best.map((r) => r.champion!.id)).toEqual([5]);
    expect(worst.map((r) => r.champion!.id)).toEqual([2]);
    expect(best[0]!.games).toBe(400);
    expect(best[0]!.winRate).toBeCloseTo(0.6);
    expect(best[0]!.delta!).toBeGreaterThan(0);
    expect(worst[0]!.delta!).toBeLessThan(0);
  });

  it("reads matchups from either side of the stored pair", () => {
    const zed = exploreChampionView(index(), 5, "middle", detailDeps)!;
    expect(zed.matchups.worst[0]!.champion!.id).toBe(1);
    expect(zed.matchups.worst[0]!.winRate).toBeCloseTo(0.4);
  });

  it("an older snapshot without builds or bans still gives numbers, and says there's no build", () => {
    const v = exploreChampionView(index({ builds: undefined, bans: undefined, banMatches: undefined } as Partial<MetaSnapshot>), 1, "middle", detailDeps)!;
    expect(v.loadout).toBeNull();
    expect(v.pages).toEqual([]);
    expect(v.core).toBeNull();
    expect(v.banRate).toBeNull();
    const html = renderToStaticMarkup(createElement(ChampionPage, { view: v, tab: "runes" as DetailTab, onTab: () => {}, onBack: () => {} }));
    expect(html).toContain("No build for Ahri in mid yet");
  });

  it("a role with numbers but no build isn't given another role's build", () => {
    const v = exploreChampionView(index(), 1, "top", detailDeps)!;
    expect(v.loadout).toBeNull();
    expect(v.winRate).toBeCloseTo(24 / 50);
  });

  it("explains what + and − mean on the Matchups tab", () => {
    const html = renderToStaticMarkup(createElement(ChampionPage, { view: view(), tab: "matchups" as DetailTab, onTab: () => {}, onBack: () => {} }));
    expect(html).toContain("usual win rates predict");
    expect(html).toContain("400 games");
  });
});

describe("the list as drawn", () => {
  const ref = <T,>(current: T): MutableRefObject<T> => ({ current });
  const draw = (rows: ExploreRow[], f = filter(), hasBans = true) =>
    renderToStaticMarkup(
      createElement(BrowseList, { list: { rank: "Gold to Platinum", patch: "16.19", matches: 21_400, roles: ["middle", "jungle"], hasBans, rows }, filter: f, minGames: MIN, scrollTop: ref(0), opened: ref(null), onFilter: () => {}, onOpen: () => {} }),
    );

  it("says whose numbers these are, in plain words", () => {
    const html = draw([row({ id: 1 })]);
    expect(html).toContain("Players in your rank (Gold to Platinum): 21k recent games");
    expect(html).not.toMatch(/band \d/i);
  });

  it("rows are buttons with a full description, so the keyboard and screen readers reach them", () => {
    const html = draw([row({ id: 1, winRate: 0.532, games: 500, yours: { games: 3, wins: 2 } })]);
    expect(html).toMatch(/<button[^>]*class="trow"[^>]*aria-label="Ahri, Mid: 53.2% win rate from 500 games, picked in 10.0%, banned in 5.0%, your games 3"/);
  });

  it("a thin row is neutral and whole, with its games", () => {
    const html = draw([row({ id: 1, winRate: 1, games: 1 })]);
    expect(html).toContain("100%");
    expect(html).toContain("1 game");
    expect(html).not.toMatch(/class="c-num pos"/);
  });

  it("says when a search finds nothing, and offers to clear it", () => {
    const html = draw([row({ id: 1 })], filter({ search: "zzz", role: "jungle" }));
    expect(html).toContain("No champion matches &quot;zzz&quot; in Jungle.");
    expect(html).toContain(t("explore.clear"));
  });

  it("without ban data the ban column can't be sorted, and a saved ban sort falls back", () => {
    const html = draw([row({ id: 1, banRate: null, winRate: 0.6 }), row({ id: 2, banRate: null, winRate: 0.4 })], filter({ sort: "banRate" }), false);
    expect(html).toMatch(/<button[^>]*class="sort"[^>]*disabled=""[^>]*>Ban</);
    expect(html).toMatch(/class="sort on"[^>]*>WR</);
  });

  it("says why there are no numbers, by cause", () => {
    const status = (over: object) => ({ lcu: "connected", gameflowPhase: null, patch: null, band: null, profile: { state: "ready", games: 5, role: null }, ...over }) as never;
    expect(browseEmptyKey({ status: status({}), meta: { state: "error", message: "x", noSnapshot: true } })).toBe("explore.empty.noSnapshot");
    expect(browseEmptyKey({ status: status({}), meta: { state: "error", message: "x" } })).toBe("explore.empty.failed");
    expect(browseEmptyKey({ status: status({}), meta: null })).toBe("explore.empty.loading");
    expect(browseEmptyKey({ status: status({ lcu: "searching", profile: { state: "idle" } }), meta: null })).toBe("explore.empty.client");
    expect(t("explore.empty.noSnapshot")).not.toBe("explore.empty.noSnapshot");
  });
});

describe("your own games", () => {
  it("are your seat only, newest first, with nobody else in them", () => {
    const v = myGamesView(matches, lookup, labels);
    expect(v.games.map((g) => g.matchId)).toEqual(["M_4", "M_3", "M_2", "M_1"]);
    expect(v.games[0]).toEqual({ matchId: "M_4", championId: 5, role: "middle", win: true, kills: 5, deaths: 2, assists: 7, cs: 180, durationSec: 1800, endedAt: 1_000_004 });
    // Champion 6 was the other participant in every game.
    expect(v.champions.map((c) => c.id).sort()).toEqual([1, 5]);
    expect(JSON.stringify(v)).not.toContain("Wukong");
    expect(v.roles).toEqual(["top", "middle"]);
  });

  it("no games, no rows", () => {
    expect(myGamesView([], lookup, labels)).toEqual({ champions: [], roles: [], games: [] });
  });

  it("skips a game whose seat is out of range", () => {
    expect(myGamesView([{ ...matches[0]!, me: 9 }], lookup, labels).games).toEqual([]);
  });

  const { games } = myGamesView(matches, lookup, labels);

  it("filter by champion and by role", () => {
    expect(filterMyGames(games, { championId: 1, role: "" })).toHaveLength(3);
    expect(filterMyGames(games, { championId: 1, role: "top" })).toHaveLength(1);
    expect(filterMyGames(games, { championId: 0, role: "middle" })).toHaveLength(3);
    expect(filterMyGames(games, { championId: 5, role: "top" })).toEqual([]);
  });

  it("add up to a record per champion, most played first", () => {
    const r = championRecords(games);
    expect(r.map((x) => [x.championId, x.games, x.wins])).toEqual([[1, 3, 2], [5, 1, 1]]);
    expect(kda(r[0]!)).toBeCloseTo((15 + 21) / 6);
    expect(kda({ kills: 3, deaths: 0, assists: 2 })).toBe(5);
  });

  it("are drawn with champion, role, result, KDA, CS and date; a filter that finds nothing says so", () => {
    const data = myGamesView(matches, lookup, labels);
    const html = renderToStaticMarkup(createElement(MyGamesList, { data, now: 1_000_100 }));
    expect(html).toContain("Zed");
    expect(html).toContain("5/2/7");
    expect(html).toContain(">180<");
    expect(html).toContain(">Win<");
    expect(html).toContain(">Loss<");
    expect(html).toContain(shortDate(1_000_004, 1_000_100));
    expect(html).toContain("Mid");
  });

  it("the year shows only when it isn't this year's", () => {
    const year = (y: number) => new Date(y, 5, 15).getTime();
    expect(shortDate(year(2026), year(2026))).toBe("Jun 15");
    expect(shortDate(year(2025), year(2026))).toBe("Jun 15, 2025");
  });
});
