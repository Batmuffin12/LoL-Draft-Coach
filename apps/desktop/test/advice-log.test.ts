import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { MockLcuServer } from "@ldc/lcu/testing";
import type { AdviceRecord, ParticipantSummary, UserMatch } from "@ldc/shared";
import { loadScenario } from "@ldc/sim";
import type { ViewState } from "../src/shared/view";
import { AdviceRecorder } from "../src/main/advice-log";
import { AdviceStore } from "../src/main/advice-store";
import { findConfigDir, loadConfig } from "../src/main/config";
import { MetaSource } from "../src/main/meta-source";
import { PersonalCoach } from "../src/main/personal-coach";
import { profileFromMatches } from "../src/main/profile";
import type { ProfileSource, ProfileSourceEvents } from "../src/main/profile-source";
import { fakeDdragonFetch, waitFor } from "./helpers";

const config = loadConfig(findConfigDir(__dirname));
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

const participant = (championId: number, win: boolean): ParticipantSummary =>
  ({ championId, teamId: 100, position: "middle", win, kills: 1, deaths: 1, assists: 1, cs: 150, gold: 9000, visionScore: 20, physicalDamage: 1000, magicDamage: 9000, trueDamage: 0, damageTaken: 9000, selfMitigated: 2000, ccSeconds: 10, objectiveDamage: 1000, items: [6655, 3020, 0, 0, 0, 0, 3340], spells: [4, 14], perks: null, challenges: {} });
const game = (id: string, championId: number, win: boolean, endedAt: number): UserMatch => ({
  match: { matchId: id, queueId: 420, gameVersion: "16.19.1", endedAt, durationSec: 1860, participants: [participant(championId, win), participant(238, !win)] },
  me: 0,
});
const history = Array.from({ length: 12 }, (_, i) => game(`EUW1_${100 + i}`, i % 2 ? 103 : 245, i % 3 > 0, 1_000_000 + i));

/** A stand-in profile source: serves a fixed history and keeps the advice it is given. */
class FakeProfiles extends EventEmitter<ProfileSourceEvents> implements ProfileSource {
  recorded: AdviceRecord[] = [];
  matches = history;
  async load(): Promise<void> {
    this.emit("profile", profileFromMatches(this.matches, []));
    this.emit("status", { state: "ready", games: this.matches.length, role: "middle" });
  }
  async refresh(): Promise<void> {
    await this.load();
  }
  async recordAdvice(record: AdviceRecord): Promise<void> {
    this.recorded.unshift(record);
    this.emit("advice", this.recorded);
  }
}

let server: MockLcuServer | null = null;
let coach: PersonalCoach | null = null;
afterEach(async () => {
  coach?.stop();
  await server?.stop();
  server = null;
  coach = null;
});

describe("advice log on a simulated game", () => {
  it("records what was shown when you locked in, sends it when the game ends, and shows the post-game card", async () => {
    const scenario = await loadScenario("full-game");
    server = new MockLcuServer(scenario.draft, {
      "/lol-summoner/v1/current-summoner": { gameName: "Me", tagLine: "EUW" },
      "/lol-ranked/v1/current-ranked-stats": { queues: [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", division: "II" }] },
    });
    const creds = await server.start();
    const profiles = new FakeProfiles();
    coach = new PersonalCoach({
      connector: new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 }),
      ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }),
      config,
      profiles,
      riotId: null,
      meta: new MetaSource({ client: () => null, cacheDir: tmp("ldc-meta-"), fixed: scenario.meta }),
    });
    const states: ViewState[] = [];
    coach.on("state", (s) => states.push(s));
    await coach.start();
    await waitFor(() => coach!.state.status.profile.state === "ready" && coach!.state.meta?.state === "ready");

    while (server.remainingFrames > 0) {
      server.step();
      await new Promise((r) => setTimeout(r, 30));
    }
    await waitFor(() => profiles.recorded.length === 1);
    const r = profiles.recorded[0]!;
    expect(r).toMatchObject({ gameId: 7123456789, queueId: 420, role: "middle", band: 2 });
    expect(r.pick.championId).toBe(103);
    expect(r.pick.expectedWin).toBeGreaterThan(0);
    expect(r.pick.terms.length).toBeGreaterThan(0);
    // The suggestions shown just before you locked in, best first, with their numbers.
    expect(r.shown.length).toBeGreaterThan(0);
    expect(r.shown.every((s) => s.expectedWin !== null)).toBe(true);

    // Before the game is in your history: the card without a result.
    await waitFor(() => coach!.state.lastGame !== null);
    expect(coach.state.lastGame).toMatchObject({ champion: { name: "Ahri" }, result: null, role: "middle" });

    // The server synced the game: the result appears.
    profiles.matches = [game("EUW1_7123456789", 103, true, 2_000_000), ...history];
    await profiles.refresh();
    await waitFor(() => coach!.state.lastGame?.result === "win");
    expect(coach.state.lastGame!.minutes).toBe(31);
    expect(coach.state.lastGame!.lines.length).toBeGreaterThan(0);
    // The % of a suggestion you took is already in the suggestion row: no line repeating it.
    const prediction = coach.state.lastGame!.prediction;
    if (r.shown.some((s) => s.championId === 103)) expect(prediction ?? "").not.toMatch(/^Win chance when you locked in: [0-9]+%$/);
    else expect(prediction).toMatch(/^Win chance when you locked in: [0-9]+%/);
  });
});

describe("AdviceRecorder", () => {
  const opt = (championId: number) => ({ championId, expectedWin: 0.5, terms: [] });
  const ctx = { role: "middle", band: 2, queueId: 420, now: 5 } as const;

  it("keeps nothing for a champ select that ends without a game (a dodge)", () => {
    const rec = new AdviceRecorder();
    rec.shown([opt(103), opt(245)]);
    rec.locked(opt(103), ctx);
    rec.newChampSelect();
    expect(rec.gameEnded()).toBeNull();
  });

  it("drops a dodged pick when the client goes back to the lobby, even with no new champ select", () => {
    const rec = new AdviceRecorder();
    rec.locked(opt(103), ctx);
    rec.leftChampSelect(); // dodge: back to the lobby; the next game (e.g. TFT) has no champ select
    rec.gameStarted(77, 1090);
    expect(rec.gameEnded()).toBeNull();

    rec.locked(opt(245), ctx);
    rec.gameStarted(78, 420);
    rec.leftChampSelect(); // a game is running: nothing is dropped
    expect(rec.gameEnded()).toMatchObject({ gameId: 78 });
  });

  it("needs the game id, and hands the record over once", () => {
    const rec = new AdviceRecorder();
    rec.shown([opt(103), opt(245)]);
    rec.locked(opt(245), ctx);
    rec.shown([]); // after lock-in the panel shows no suggestions: the record keeps the earlier ones
    rec.gameStarted(42, null);
    const r = rec.gameEnded();
    expect(r).toMatchObject({ gameId: 42, queueId: 420, pick: { championId: 245 } });
    expect(r!.shown.map((s) => s.championId)).toEqual([103, 245]);
    expect(rec.gameEnded()).toBeNull();
  });
});

describe("AdviceStore (direct mode)", () => {
  it("keeps one record per game, newest first", async () => {
    const store = new AdviceStore(join(tmp("ldc-adv-"), "advice.json"));
    const rec = (gameId: number, lockedAt: number): AdviceRecord => ({ gameId, queueId: 420, role: "middle", band: 2, lockedAt, pick: { championId: 103, expectedWin: null, terms: [] }, shown: [] });
    await store.add(rec(1, 10));
    await store.add(rec(2, 20));
    const list = await store.add({ ...rec(1, 10), pick: { championId: 99, expectedWin: null, terms: [] } });
    expect(list.map((a) => [a.gameId, a.pick.championId])).toEqual([[2, 103], [1, 99]]);
    expect(await store.list()).toEqual(list);
  });
});

describe("FileProfileSource (LDC_PROFILE_FILE)", () => {
  it("serves a saved history and the local advice log without a Riot key", async () => {
    const { FileProfileSource } = await import("../src/main/profile-source");
    const source = new FileProfileSource({ read: async () => ({ matches: history, masteries: [] }), advice: new AdviceStore(join(tmp("ldc-fp-"), "advice.json")) });
    const games: number[] = [];
    const statuses: string[] = [];
    source.on("profile", (p) => games.push(p.games.length));
    source.on("status", (s) => statuses.push(s.state));
    await source.load();
    expect(games).toEqual([12]);
    expect(statuses).toEqual(["ready"]);
  });
});
