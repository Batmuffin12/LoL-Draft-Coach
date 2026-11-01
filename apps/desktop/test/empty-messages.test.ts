import { beforeAll, describe, expect, it } from "vitest";
import type { CoachStatus } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { uiCopy, viewLimits } from "../src/main/personal-coach";
import { lobbyEmpty, noBansKey, noPicksKey, roleGamesProgress, setCopy, t } from "../src/renderer/format";
import { emptyViewState, type ViewState } from "../src/shared/view";

const config = loadConfig(findConfigDir(__dirname));
const limits = viewLimits(config);

beforeAll(() => setCopy(uiCopy(config.explain.templates)));

const status = (profile: CoachStatus["profile"], lcu: CoachStatus["lcu"] = "connected"): CoachStatus => ({ ...emptyViewState().status, lcu, profile });
const ready = { state: "ready" as const, games: 40, role: null };
const failed = { state: "error" as const, message: "Riot said no" };
const loading = { state: "loading" as const, done: 3, total: 40 };
const idle = { state: "idle" as const };
const metaReady: ViewState["meta"] = { state: "ready", band: 1, patch: "16.19", matches: 1000, createdAt: 0, offline: false };

describe("champ select says why there is no suggestion", () => {
  const picks = (profile: CoachStatus["profile"], unsupportedQueue = false) => t(noPicksKey({ unsupportedQueue, status: status(profile) }));

  it("gives a different message for each cause", () => {
    const all = [picks(failed), picks(loading), picks(idle), picks(ready), picks(ready, true)];
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((m) => !m.startsWith("pick.empty"))).toBe(true);
  });

  it("never says they appear during champ select, while you're in it", () => {
    for (const p of [failed, loading, idle, ready]) expect(picks(p)).not.toMatch(/during champ select/);
  });

  it("a failed load promises nothing, and an unsupported queue wins over the rest", () => {
    expect(picks(failed)).toMatch(/didn't load/);
    expect(picks(failed)).not.toMatch(/once/);
    expect(picks(failed, true)).toMatch(/this queue/);
    expect(picks(loading)).toMatch(/once your match history is loaded/);
  });

  const bans = (over: Partial<Pick<ViewState, "meta" | "unsupportedQueue">>, profile: CoachStatus["profile"] = ready) => t(noBansKey({ unsupportedQueue: false, meta: metaReady, status: status(profile), ...over }));

  it("bans: the live data's problem first, then your games, and no promise after a failure", () => {
    expect(bans({ meta: null })).toBe("No ban suggestions yet: there's no data for your rank.");
    expect(bans({ meta: { state: "error", message: "x", noSnapshot: true } })).toBe("No ban suggestions yet: there's no data for your rank.");
    expect(bans({ meta: { state: "error", message: "x" } })).toMatch(/couldn't get the data/);
    expect(bans({}, failed)).toMatch(/didn't load/);
    expect(bans({}, failed)).not.toMatch(/once/);
    expect(bans({}, loading)).toMatch(/once your match history is loaded/);
    expect(bans({ unsupportedQueue: true }, failed)).toMatch(/this queue/);
  });
});

describe("an empty tab shows how far along you are", () => {
  const roles = (...games: number[]) => games.map((g) => ({ games: g })) as ViewState["roles"];

  it("counts your most played role towards what it takes", () => {
    expect(roleGamesProgress({ roles: roles(1, 3), status: status(ready) }, 8)).toEqual({ text: "3 of 8 games in a role", done: 3, total: 8 });
  });

  it("shows nothing with no games yet, once there's enough, or while they load", () => {
    expect(roleGamesProgress({ roles: [], status: status(ready) }, 8)).toBeNull();
    expect(roleGamesProgress({ roles: roles(8), status: status(ready) }, 8)).toBeNull();
    expect(roleGamesProgress({ roles: roles(3), status: status(loading) }, 8)).toBeNull();
  });
});

describe("lobby tabs say why they're empty", () => {
  it("no games in the month is said as that, not as still loading", () => {
    expect(lobbyEmpty(status(ready), "month", { n: limits.monthDays })).toBe(`No games in the last ${config.engine.report.days} days.`);
    expect(lobbyEmpty(status(loading), "month", { n: limits.monthDays })).toMatch(/once your recent games are loaded/);
  });

  it("a pool below the minimum names the games it takes, from the config", () => {
    expect(lobbyEmpty(status(ready), "pool", { n: limits.poolGames })).toBe(`Play ${config.engine.roleAdvice.minGames} games in a role to see its pool.`);
    expect(lobbyEmpty(status(ready), "pool", { n: 1 })).toBe("Play 1 game in a role to see its pool.");
    expect(lobbyEmpty(status(ready), "style", { n: limits.styleGames })).toContain(`Play ${config.engine.playstyle.minGamesPerRole} games`);
  });

  it("failed games and a closed client come first", () => {
    expect(lobbyEmpty(status(failed), "month")).toMatch(/didn't load/);
    expect(lobbyEmpty(status(idle, "disconnected"), "pool")).toBe(t("profile.openClient"));
  });
});
