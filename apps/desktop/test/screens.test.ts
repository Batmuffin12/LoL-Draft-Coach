// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy } from "../src/main/personal-coach";
import { DraftBoard } from "../src/renderer/components/DraftBoard";
import { RunePage } from "../src/renderer/components/RunePage";
import { positionLabel, setCopy, t } from "../src/renderer/format";
import { MyGames, MyGamesList } from "../src/renderer/screens/MyGames";
import { NewChamps } from "../src/renderer/screens/NewChamps";
import { Pool } from "../src/renderer/screens/Pool";
import { isEvenStyle, Style } from "../src/renderer/screens/Style";
import type { MyGames as MyGamesData } from "../src/shared/explore";
import { emptyViewState, type DraftView, type ViewState } from "../src/shared/view";
import { button, cleanup, click, createElement, fakeCoach, fakeLayout, hasButton, render, settle } from "./dom";

const copy = uiCopy(loadConfig(findConfigDir(__dirname)).explain.templates);
const state = (over: Partial<ViewState> = {}): ViewState => ({ ...emptyViewState(), copy, ...over });
const champ = (id: number, name: string) => ({ id, name, iconUrl: null });

let coach: ReturnType<typeof fakeCoach>;
beforeEach(() => {
  setCopy(copy);
  coach = fakeCoach();
  fakeLayout();
});
afterEach(cleanup);

describe("My games", () => {
  const game = (i: number, championId: number, role: string, win: boolean) => ({ matchId: `EUW1_${i}`, championId, role, win, kills: 5, deaths: 2, assists: 7, cs: 180, durationSec: 1800, endedAt: 1_000_000 - i });
  const data: MyGamesData = {
    champions: [champ(103, "Ahri"), champ(86, "Garen")],
    roles: ["top", "middle"],
    games: [game(1, 103, "middle", true), game(2, 103, "middle", false), game(3, 86, "top", true)],
  };
  const names = () => [...document.querySelectorAll(".trow .nm")].map((n) => n.childNodes[0]!.textContent);
  const select = () => document.querySelector<HTMLSelectElement>("select")!;
  const choose = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(), value);
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const list = (d = data) => render(createElement(MyGamesList, { data: d, now: 2_000_000 }));

  it("lists your games, with K/D/A and result", async () => {
    await list();
    expect(names()).toEqual(["Ahri", "Ahri", "Garen"]);
    expect(document.body.textContent).toContain("5/2/7");
    expect(document.querySelectorAll(".pos").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll(".neg").length).toBeGreaterThanOrEqual(1);
  });

  it("filters by champion, and the choice lists only the role's champions", async () => {
    await list();
    await choose("86");
    expect(names()).toEqual(["Garen"]);
    await choose("0");
    expect(names()).toHaveLength(3);
    await click(button(positionLabel("middle")));
    expect(names()).toEqual(["Ahri", "Ahri"]);
    expect([...select().options].map((o) => o.value)).toEqual(["0", "103"]);
  });

  it("a filter that leaves nothing says so, and Clear brings everything back", async () => {
    await list();
    await choose("86");
    await click(button(positionLabel("middle")));
    expect(names()).toEqual([]);
    expect(document.body.textContent).toContain(t("games.noMatch"));
    await click(t("games.clear"));
    expect(names()).toHaveLength(3);
  });

  it("By champion sums up per champion; clicking one shows its games", async () => {
    await list();
    await click(t("games.byChampion"));
    expect(names()).toEqual(["Ahri", "Garen"]);
    expect(document.body.textContent).toContain("1–1");
    await click(document.querySelectorAll(".trow")[1]!);
    expect(names()).toEqual(["Garen"]);
    expect(select().value).toBe("86");
  });

  it("draws 200 rows at first, and the rest on request", async () => {
    const many = { ...data, games: Array.from({ length: 450 }, (_, i) => game(i, 103, "middle", i % 2 === 0)) };
    await list(many);
    expect(names()).toHaveLength(200);
    await click(t("games.more", { n: 200 }));
    expect(names()).toHaveLength(400);
    await click(t("games.more", { n: 50 }));
    expect(names()).toHaveLength(450);
    expect(document.querySelector(".more")).toBeNull();
  });

  it("asks for your games once per history; no games or a failed call show a message, not a broken screen", async () => {
    const ready = (games: number) => state({ status: { ...emptyViewState().status, profile: { state: "ready", games, role: "middle" } as never } });
    coach.api.exploreGames.mockResolvedValue(data);
    await render(createElement(MyGames, { state: ready(3), touring: false }));
    await settle();
    expect(coach.api.exploreGames).toHaveBeenCalledOnce();
    expect(names()).toHaveLength(3);
    await cleanup();
    coach = fakeCoach();
    fakeLayout();
    coach.api.exploreGames.mockRejectedValue(new Error("ipc"));
    await render(createElement(MyGames, { state: ready(3), touring: false }));
    await settle();
    expect(document.querySelector(".trow")).toBeNull();
    expect(document.body.textContent).toBeTruthy();
  });
});

describe("Pool", () => {
  const role = (name: string, over: object = {}) => ({ role: name, games: 40, winRate: 0.55, enoughData: true, pool: [{ champion: champ(103, "Ahri"), tier: "main", tierLabel: "Main", games: 30, winRate: 0.6 }], holes: [], also: [], coverage: { needs: [{ need: "engage", label: "Engage", gap: true }, { need: "tank", label: "Tank", gap: false }], covers: { 103: ["tank"] } }, nextStep: null, missing: null, noGaps: "No gaps here", ...over });
  const roles = (...r: object[]) => state({ roles: r as unknown as ViewState["roles"] });

  it("leaves out roles without enough games, and says how far along you are when none has", async () => {
    await render(createElement(Pool, { state: roles(role("top", { enoughData: false })), onNewChamps: () => {} }));
    expect(document.querySelector(".section")).toBeNull();
    expect(document.body.textContent).toBeTruthy();
  });

  it("clicks between roles, keeping to the ones with data", async () => {
    await render(createElement(Pool, { state: roles(role("top", { noGaps: "Top is covered" }), role("middle", { noGaps: "Mid is covered" }), role("jungle", { enoughData: false })), onNewChamps: () => {} }));
    expect(hasButton(positionLabel("jungle"))).toBe(false);
    expect(document.body.textContent).toContain("Top is covered");
    // A dot where the champion brings the need, a gap in its own colour.
    expect([...document.querySelectorAll(".mx-cell .dot")].map((d) => d.className)).toEqual(["dot no", "dot yes"]);
    expect(document.querySelector(".mx-need.neg")!.textContent).toBe("Engage");
    await click(positionLabel("middle"));
    expect(document.body.textContent).toContain("Mid is covered");
  });

  it("a role with a hole offers New champions, and the button goes there", async () => {
    let went = 0;
    const missing = { row: { label: "Missing", items: [{ text: "Engage" }] }, note: "Nothing you play has it" };
    await render(createElement(Pool, { state: roles(role("top", { missing })), onNewChamps: () => void went++ }));
    expect(document.body.textContent).toContain("Engage");
    await click(t("pool.seeNew"));
    expect(went).toBe(1);
  });

  it("a role you know nothing on says so instead of an empty table", async () => {
    await render(createElement(Pool, { state: roles(role("top", { pool: [], coverage: null })), onNewChamps: () => {} }));
    expect(document.querySelector(".mx")).toBeNull();
    expect(document.querySelector("p.caption")!.textContent).toBeTruthy();
  });
});

describe("New champions", () => {
  const pick = (id: number, name: string) => ({ champion: champ(id, name), reasons: [], winRate: 0.53, games: 400, pickRate: 0.1, fit: 0.7 });
  const role = (name: string, over: object = {}) => ({ role: name, picks: [pick(245, "Ekko")], plan: null, planLearn: null, learning: null, ...over });
  const ready = { state: "ready", band: 2, patch: "16.19", matches: 1000, createdAt: 1, offline: false } as const;

  it("without live data says that, not that you need more games", async () => {
    await render(createElement(NewChamps, { state: state() }));
    expect(document.body.textContent).toContain(t("new.noMeta"));
  });

  it("with live data and no suggestions yet, tells you how far along you are", async () => {
    await render(createElement(NewChamps, { state: state({ meta: ready }) }));
    expect(document.body.textContent).not.toContain(t("new.noMeta"));
  });

  it("clicks between roles", async () => {
    const s = state({ meta: ready, newChamps: [role("top", { picks: [pick(86, "Garen")] }), role("middle")] as unknown as ViewState["newChamps"] });
    await render(createElement(NewChamps, { state: s }));
    expect(document.body.textContent).toContain("Garen");
    await click(positionLabel("middle"));
    expect(document.body.textContent).toContain("Ekko");
    expect(document.body.textContent).not.toContain("Garen");
  });

  it("while learning a champion: its stage, what to watch this game, and your last games on it", async () => {
    const learning = { champion: champ(245, "Ekko"), title: "Learning Ekko", progress: "3 of 10 games", after: "After that", why: "Fits your pool", learn: { stage: "First games", focus: { text: "Watch your cooldowns", recent: [true, false, true] }, lines: [{ label: "Combo", items: [{ text: "Q E" }], minor: false }] } };
    await render(createElement(NewChamps, { state: state({ meta: ready, newChamps: [role("middle", { learning, picks: [] })] as unknown as ViewState["newChamps"] }) }));
    for (const text of ["Learning Ekko", "3 of 10 games", "Watch your cooldowns", "Q E"]) expect(document.body.textContent).toContain(text);
    expect(document.querySelectorAll(".games .g")).toHaveLength(3);
    expect(document.querySelectorAll(".games .g.met")).toHaveLength(2);
  });

  it("a first-games plan shows under the table", async () => {
    await render(createElement(NewChamps, { state: state({ meta: ready, newChamps: [role("middle", { plan: "Three games on Ekko" })] as unknown as ViewState["newChamps"] }) }));
    expect(document.body.textContent).toContain("Three games on Ekko");
  });
});

describe("Style", () => {
  const axis = (axis: string, level: string, score = 50) => ({ axis, label: axis, score, level, levelLabel: level, detail: null, games: 40, metrics: [] });
  const play = (role: string, axes: object[], over: object = {}) => ({ role, games: 40, axes, numbers: [], summary: [{ label: "Your style", items: [{ text: "Close to your rank on every axis" }] }], how: null, ...over });
  const mixed = [axis("farming", "high", 70), axis("vision", "low", 30), axis("roaming", "mid"), axis("riskControl", "mid"), axis("earlyPressure", "mid")];

  it("no chart when nothing stands out: the sentence says it", async () => {
    const even = [axis("farming", "mid"), axis("vision", "mid"), axis("roaming", "mid")];
    expect(isEvenStyle(even as never)).toBe(true);
    expect(isEvenStyle([] as never)).toBe(false);
    await render(createElement(Style, { state: state({ playstyle: [play("middle", even)] as unknown as ViewState["playstyle"] }) }));
    expect(document.querySelector("svg")).toBeNull();
    expect(document.querySelector(".style-even")!.textContent).toBe("Close to your rank on every axis");
  });

  it("a radar when something does, and one role at a time", async () => {
    expect(isEvenStyle(mixed as never)).toBe(false);
    const s = state({ playstyle: [play("middle", mixed), play("top", mixed, { summary: [{ label: "Strong", items: [{ text: "Top laner" }] }] })] as unknown as ViewState["playstyle"] });
    await render(createElement(Style, { state: s }));
    expect(document.querySelector("svg")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Top laner");
    await click(positionLabel("top"));
    expect(document.body.textContent).toContain("Top laner");
  });

  it("your numbers against your rank, when there are any", async () => {
    const numbers = [{ label: "CS/min", you: "6.6", typical: "6.9", tone: "neg", title: "x", relative: -0.1 }];
    await render(createElement(Style, { state: state({ playstyle: [play("middle", mixed, { numbers })] as unknown as ViewState["playstyle"] }) }));
    expect(document.body.textContent).toContain("CS/min");
    expect(document.body.textContent).toContain("6.6");
  });
});

describe("the draft board, undocked", () => {
  const slot = (cellId: number, over: object = {}) => ({ cellId, champion: null, hover: null, position: "top", isLocalPlayer: false, actingType: null, ...over });
  const board = (over: Partial<DraftView>) => createElement(DraftBoard, { draft: { myTeam: [], theirTeam: [], myBans: [], theirBans: [], ...over } as unknown as DraftView });

  it("a seat is a champion and a position: yours says You, an empty one who's acting", async () => {
    await render(
      board({
        myTeam: [slot(0, { isLocalPlayer: true, hover: champ(103, "Ahri") }), slot(1, { champion: champ(86, "Garen") })] as never,
        theirTeam: [slot(5, { actingType: "pick" }), slot(6, { actingType: "ban" }), slot(7)] as never,
        theirBans: [champ(238, "Zed")] as never,
      }),
    );
    const seats = [...document.querySelectorAll(".seat")].map((s) => s.textContent);
    expect(seats[0]).toContain("Ahri");
    expect(seats[0]).toContain("You");
    expect(seats[1]).toContain("Garen");
    expect(seats[2]).toContain("Picking");
    expect(seats[3]).toContain("Banning");
    expect(seats[4]).toContain("—");
    expect(document.querySelector(".seat.me .nm")!.classList.contains("dim")).toBe(true);
    expect(document.querySelectorAll(".team.enemy .bans > *")).toHaveLength(1);
  });

  it("has no field for a player's name to come from", async () => {
    const leaky = slot(0, { gameName: "SECRET", summonerName: "SECRET", puuid: "SECRET" });
    await render(board({ myTeam: [leaky] as never }));
    expect(document.body.innerHTML).not.toContain("SECRET");
  });
});

describe("a rune page on its trees", () => {
  const icon = (id: number) => ({ id, name: `Rune ${id}`, iconUrl: null });
  const tree = (style: number, rows: number[][]) => ({ style: icon(style), rows: rows.map((r) => r.map(icon)) });
  const props = (over: object = {}) => ({ primary: tree(8100, [[8112, 8124], [8126, 8139]]), secondary: tree(8200, [[8226, 8275]]), runes: [icon(8112), icon(8139), icon(8226)], shards: { rows: [[5005, 5008].map(icon), [5001, 5002].map(icon)], chosen: [1, -1] }, swaps: [], ...over });
  const swap = (id: number, why: string) => ({ ...icon(id), reasons: [why] });

  it("lights what's taken and greys the rest, shards by their row", async () => {
    await render(createElement(RunePage, props()));
    const lit = (cls: string) => [...document.querySelectorAll(cls)];
    expect(lit(".tree-row").length).toBe(5);
    const titled = [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"));
    expect(titled).toContain("Rune 8112 (take this)");
    expect(titled).toContain("Rune 8124");
    expect(titled).toContain("Rune 8226 (take this)");
  });

  it("one swap says why; more each take one line with the reason on hover", async () => {
    await render(createElement(RunePage, props({ swaps: [swap(1, "Good against tanks")] })));
    expect(document.querySelector(".swap")!.textContent).toContain("good against tanks");
    await cleanup();
    fakeLayout();
    await render(createElement(RunePage, props({ swaps: [swap(1, "Good against tanks"), swap(2, "Good against healing")] })));
    expect(document.querySelectorAll(".swap")).toHaveLength(2);
    expect(document.querySelector(".swap")!.textContent).not.toContain("tanks");
  });

  it("swaps that don't fit move to the hover text of the first row, or the trees' with none shown", async () => {
    const three = [swap(1, "One"), swap(2, "Two"), swap(3, "Three")];
    await render(createElement(RunePage, props({ swaps: three, maxSwaps: 1 })));
    expect(document.querySelectorAll(".swap")).toHaveLength(1);
    expect(document.querySelector(".swap")!.outerHTML).toMatch(/Rune 2: Two/);
    await cleanup();
    fakeLayout();
    await render(createElement(RunePage, props({ swaps: three, maxSwaps: 0 })));
    expect(document.querySelectorAll(".swap")).toHaveLength(0);
    expect(document.querySelector(".trees")!.outerHTML).toMatch(/Rune 1: One/);
  });
});
