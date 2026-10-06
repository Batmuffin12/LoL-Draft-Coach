import { afterEach, describe, expect, it } from "vitest";
import { ChampSelectSessionSchema, FixtureSchema, findIdentifiers, LcuHttp, sanitizeChampSelect, type Fixture } from "@ldc/lcu";
import { MockLcuServer } from "@ldc/lcu/testing";
import { draft, listScenarios, loadScenario } from "../src/index";

const sessions = (f: Fixture) => [f.snapshots["/lol-champ-select/v1/session"], ...f.frames.filter((x) => x.uri === "/lol-champ-select/v1/session" && x.data).map((x) => x.data)].map((d) => ChampSelectSessionSchema.parse(d));
const last = (f: Fixture) => sanitizeChampSelect(sessions(f).at(-1)!);

describe("draft simulator", () => {
  it("builds a valid fixture whose sessions pass the LCU schema and the sanitiser", () => {
    const f = draft().me("middle").hover(103).ally("top", 86).enemy(238).bans([157], [84]).pick(103).build();
    expect(FixtureSchema.parse(f)).toBeTruthy();
    expect(findIdentifiers(f)).toEqual([]);
    for (const s of sessions(f)) expect(() => sanitizeChampSelect(s)).not.toThrow();
    // Phases in order, then champ select closes and the game starts.
    const phases = sessions(f).map((s) => s.timer.phase);
    expect(phases[0]).toBe("PLANNING");
    expect(phases).toContain("BAN_PICK");
    expect(phases.at(-1)).toBe("FINALIZATION");
    expect(f.frames.at(-1)).toMatchObject({ uri: "/lol-gameflow/v1/gameflow-phase", data: "GameStart" });
  });

  it("puts the local player in the chosen position and shows the planning hover", () => {
    const f = draft().me("jungle").hover(32).stopAt("planning").build();
    const d = last(f);
    const me = d.myTeam.find((s) => s.isLocalPlayer)!;
    expect(me.position).toBe("jungle");
    expect(me.pickIntentId).toBe(32);
    expect(d.timerPhase).toBe("PLANNING");
    expect(f.frames).toEqual([]);
  });

  it("stops at your ban with every ban in progress, then reveals the bans", () => {
    const atBan = last(draft().hover(103).bans([238, 157], [84]).stopAt("my-ban").build());
    expect(atBan.actions.filter((a) => a.type === "ban" && a.inProgress)).toHaveLength(10);
    expect(atBan.myBans).toEqual([]);
    const done = last(draft().hover(103).bans([238, 157], [84]).stopAt("bans-done").build());
    expect(done.myBans).toEqual([238, 157]);
    expect(done.theirBans).toEqual([84]);
  });

  it("follows the snake pick order: blue side first, red side last pick sees every enemy", () => {
    // Blue side, middle third in cell order: their first two picks are in before your turn.
    const blue = last(draft().me("middle").hover(103).enemy(238).enemy(84).enemy(157).stopAt("my-pick").build());
    expect(blue.theirTeam.filter((s) => s.championId > 0).map((s) => s.championId)).toEqual([238, 84]);
    const mine = blue.actions.find((a) => a.actorCellId === blue.localCellId && a.type === "pick")!;
    expect(mine).toMatchObject({ inProgress: true, completed: false, championId: 103 });

    const red = last(
      draft({ side: "red" })
        .order(["top", "jungle", "bottom", "utility", "middle"])
        .me("middle")
        .hover(99)
        .enemy(64)
        .enemy(86)
        .enemy(51)
        .enemy(111)
        .enemy(238)
        .stopAt("my-pick")
        .build(),
    );
    expect(red.localCellId).toBe(9);
    expect(red.theirTeam.map((s) => s.championId)).toEqual([64, 86, 51, 111, 238]);
  });

  it("locks your pick and clears the hover", () => {
    const d = last(draft().hover(103).pick(99).stopAt("locked").build());
    const me = d.myTeam.find((s) => s.isLocalPlayer)!;
    expect(me.championId).toBe(99);
    expect(me.pickIntentId).toBe(0);
  });

  it("plays a whole game to EndOfGame", () => {
    const f = draft().hover(103).stopAt("game-end").build();
    expect(f.frames.filter((x) => x.uri === "/lol-gameflow/v1/gameflow-phase").map((x) => x.data)).toEqual(["GameStart", "InProgress", "EndOfGame"]);
  });

  it("rejects drafts the client wouldn't allow", () => {
    expect(() => draft().pick(103).enemy(103).build()).toThrow(/picked twice/);
    expect(() => draft().pick(103).bans([103]).build()).toThrow(/banned and picked/);
    expect(() => draft().enemy(1).enemy(2).enemy(3).enemy(4).enemy(5).enemy(6)).toThrow(/five picks/);
  });
});

describe("scenarios", () => {
  it("all load and are valid fixtures without identifiers", async () => {
    const names = listScenarios();
    expect(names).toContain("mid-counter");
    for (const n of names) {
      const s = await loadScenario(n);
      expect(FixtureSchema.parse(s.draft)).toBeTruthy();
      expect(findIdentifiers(s.draft)).toEqual([]);
      for (const x of sessions(s.draft)) expect(() => sanitizeChampSelect(x)).not.toThrow();
    }
  });
});

describe("mock client on a scenario", () => {
  let server: MockLcuServer | null = null;
  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("serves the scenario's stop point after replay", async () => {
    const s = await loadScenario("mid-counter");
    server = new MockLcuServer(s.draft);
    const http = new LcuHttp(await server.start());
    await server.playAll();
    const session = ChampSelectSessionSchema.parse(await http.get("/lol-champ-select/v1/session"));
    const d = sanitizeChampSelect(session);
    expect(d.theirTeam.filter((x) => x.championId > 0)).toHaveLength(5);
    expect(d.actions.find((a) => a.actorCellId === d.localCellId && a.type === "pick")?.inProgress).toBe(true);
    http.close();
  });
});
