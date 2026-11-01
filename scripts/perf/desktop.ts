/**
 * Desktop measurements for `pnpm perf`: runs the built panel (apps/desktop/dist) offline against the
 * mock League client on a simulator scenario, a synthetic history (packages/sim) and the scenario's
 * meta snapshot, in a throwaway profile (.local/perf-profile). No Riot API, no server.
 *
 *   tsx scripts/perf/desktop.ts startup <runs> <out.json>
 *   tsx scripts/perf/desktop.ts replay <scenario> <seconds> <out.json> [clicks JSON] [rounds]
 *   tsx scripts/perf/desktop.ts screens <outDir>
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Fixture } from "@ldc/lcu";
import { MockLcuServer } from "@ldc/lcu/testing";
import { history, loadScenario } from "@ldc/sim";
import { world } from "../../packages/sim/scenarios/_world";
import { HINT_IDS } from "../../apps/desktop/src/shared/ui-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktop = join(root, "apps", "desktop");
const electron = join(desktop, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const local = join(root, ".local");
const profileDir = join(local, "perf-profile");
/** One replay of a scenario's draft takes this long (the frames' timing, scaled). */
const REPLAY_MS = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The env file the panel reads (LDC_ENV_FILE): no keys, no server, a made-up Riot ID. */
function envFile(serverUrl?: string): string {
  mkdirSync(local, { recursive: true });
  const file = join(local, serverUrl ? "perf-connect.env" : "perf.env");
  writeFileSync(file, `RIOT_ID="Perf#SIM"\n${serverUrl ? `SERVER_URL=${serverUrl}\n` : ""}`);
  return file;
}

/** A synthetic history anchored at now (the same games every run, the same ages). */
function historyFile(): string {
  const file = join(local, "perf-history.json");
  writeFileSync(file, JSON.stringify(history({ now: Date.now(), games: 1000, days: 365 })));
  return file;
}

function metaFile(name: string, meta: unknown): string {
  mkdirSync(local, { recursive: true });
  const file = join(local, `perf-meta-${name}.json`);
  writeFileSync(file, JSON.stringify(meta));
  return file;
}

/** The client out of champ select: idle ("None") or in a lobby with your two roles chosen ("Lobby"). */
function idleFixture(phase: "None" | "Lobby"): Fixture {
  const owned = [103, 245, 99, 238, 86, 122, 32, 84, 157];
  return {
    format: 1,
    description: `client ${phase}`,
    recordedAt: "simulated",
    snapshots: {
      "/lol-gameflow/v1/gameflow-phase": phase,
      "/lol-gameflow/v1/session": { phase, gameData: { queue: { id: 420, type: "RANKED_SOLO_5x5" } } },
      "/lol-champions/v1/owned-champions-minimal": owned.map((id) => ({ id, ownership: { owned: true } })),
      ...(phase === "Lobby"
        ? { "/lol-lobby/v2/lobby": { localMember: { firstPositionPreference: "MIDDLE", secondPositionPreference: "TOP" }, gameConfig: { queueId: 420, isCustom: false } } }
        : {}),
    },
    frames: [],
  };
}

interface Setup {
  fixture: Fixture;
  meta: string | null;
  /** Replay the frames in a loop at this time scale until `until` (epoch ms); 0 = all at once on connect. */
  timeScale: number;
}

async function scenarioSetup(name: string, timeScale: number): Promise<Setup> {
  if (name === "idle" || name === "lobby") return { fixture: idleFixture(name === "idle" ? "None" : "Lobby"), meta: metaFile(name, world()), timeScale: 0 };
  const s = await loadScenario(name);
  // A fixed speed for replays: each replay of the draft lasts REPLAY_MS.
  const last = s.draft.frames.at(-1)?.t ?? 0;
  return { fixture: s.draft, meta: s.meta ? metaFile(name, s.meta) : null, timeScale: timeScale > 0 && last > 0 ? REPLAY_MS / last : 0 };
}

/** Runs the mock client: on connect, plays the frames (looping until `until`, the last replay ending before it). */
function driveMock(server: MockLcuServer, fixture: Fixture, timeScale: number, until: number): { stop: () => void } {
  let stopped = false;
  void (async () => {
    while (server.clientCount === 0 && !stopped) await sleep(50);
    if (stopped) return;
    if (timeScale === 0) {
      await server.playAll(0);
      return;
    }
    const length = (fixture.frames.at(-1)?.t ?? 0) * timeScale;
    for (;;) {
      await sleep(1_000);
      await server.playAll(timeScale);
      // Another replay only if it ends (with its pause) well before the clicks start.
      if (stopped || Date.now() + 3_000 + length + 3_000 > until) return;
      await sleep(2_000);
      server.reset();
      for (const [uri, body] of Object.entries(fixture.snapshots)) server.push(uri, body);
    }
  })();
  return { stop: () => (stopped = true) };
}

interface LaunchResult {
  code: number | null;
  stdout: string;
}

/** App state the panel keeps between runs (advice log, account, caches): wiped so every run starts the same. Data Dragon's cache stays. */
const APP_STATE = ["advice.json", "advice-outbox.json", "account.json", "profile-matches.json", "meta", "config"];

/** The panel opens on top of everything: never during a game, and not when that can't be checked. Checked before each launch, because a game can start between two. */
function refuseDuringGame(): void {
  if (process.platform !== "win32") return;
  const game = "League of Legends.exe";
  const check = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${game}`], { encoding: "utf8" });
  if (check.status !== 0 || check.error) throw new Error("Couldn't check for a running game: not opening the panel");
  if (check.stdout.includes(game)) throw new Error(`${game} is running: not opening the panel`);
}

function launch(env: Record<string, string>): Promise<LaunchResult> {
  refuseDuringGame();
  for (const f of APP_STATE) rmSync(join(profileDir, f), { recursive: true, force: true });
  return new Promise((resolve) => {
    const child = spawn(electron, ["."], {
      cwd: desktop,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stdout += d.toString()));
    const kill = setTimeout(() => child.kill(), 180_000);
    child.on("exit", (code) => {
      clearTimeout(kill);
      resolve({ code, stdout });
    });
  });
}

async function withMock<T>(setup: Setup, until: number, run: (lcuOverride: string) => Promise<T>): Promise<T> {
  const server = new MockLcuServer(setup.fixture);
  const creds = await server.start();
  const drive = driveMock(server, setup.fixture, setup.timeScale, until);
  try {
    return await run(`${creds.port}:${creds.password}`);
  } finally {
    drive.stop();
    await server.stop();
  }
}

/** The measured screens stay comparable across versions: a profile past the tour and every one-time hint. */
function skipFirstUse(): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, "ui-state.json"), JSON.stringify({ tourDone: true, hintsSeen: HINT_IDS }));
}

function baseEnv(setup: Setup, lcu: string, opts: { profile?: boolean; serverUrl?: string } = {}): Record<string, string> {
  skipFirstUse();
  return {
    LDC_ENV_FILE: envFile(opts.serverUrl),
    LDC_USER_DATA_DIR: profileDir,
    LDC_LCU_OVERRIDE: lcu,
    ...(opts.profile === false ? {} : { LDC_PROFILE_FILE: historyFile() }),
    ...(setup.meta ? { LDC_META_FILE: setup.meta } : {}),
  };
}

/** Cold start: `runs` launches (after one warm-up launch that fills the caches), each until the first full screen. */
async function startup(runs: number, out: string): Promise<void> {
  const setup = await scenarioSetup("mid-counter", 0);
  const results: unknown[] = [];
  for (let i = 0; i <= runs; i++) {
    const file = join(local, `perf-startup-${i}.json`);
    rmSync(file, { force: true });
    await withMock(setup, 0, async (lcu) => {
      const r = await launch({ ...baseEnv(setup, lcu), LDC_PERF: file, LDC_PERF_MODE: "startup", LDC_PERF_T0: String(Date.now()) });
      if (!existsSync(file)) throw new Error(`startup run ${i} wrote no results (exit ${r.code}):\n${r.stdout.slice(-2000)}`);
    });
    if (i > 0) results.push(JSON.parse(readFileSync(file, "utf8")));
    process.stdout.write(`startup ${i === 0 ? "warm-up" : `${i}/${runs}`} done\n`);
  }
  writeFileSync(out, JSON.stringify(results));
}

/** A replay of `scenario` for `seconds`, then the clicks; writes the panel's raw numbers to `out`. */
async function replay(scenario: string, seconds: number, out: string, clicks: string[], rounds: number): Promise<void> {
  const setup = await scenarioSetup(scenario, 1);
  rmSync(out, { force: true });
  const until = Date.now() + 6_000 + seconds * 1000;
  await withMock(setup, until, async (lcu) => {
    const r = await launch({
      ...baseEnv(setup, lcu),
      LDC_PERF: out,
      LDC_PERF_MODE: "replay",
      LDC_PERF_SECONDS: String(seconds),
      LDC_PERF_CLICKS: JSON.stringify(clicks),
      LDC_PERF_CLICK_ROUNDS: String(rounds),
    });
    if (!existsSync(out)) throw new Error(`replay ${scenario} wrote no results (exit ${r.code}):\n${r.stdout.slice(-2000)}`);
  });
}

/** The screens the regression guard compares: name, scenario and what to click first. */
export const SCREENS: { name: string; scenario: string; click?: string; connect?: boolean }[] = [
  { name: "Connect", scenario: "idle", connect: true },
  { name: "Ban", scenario: "mid-ban" },
  { name: "Pick", scenario: "mid-counter" },
  { name: "LockedIn-Runes", scenario: "locked-solid", click: "Runes" },
  { name: "LockedIn-Build", scenario: "locked-solid", click: "Build" },
  { name: "LockedIn-Matchups", scenario: "locked-solid", click: "Matchups" },
  { name: "LastGame", scenario: "idle", click: "Last game" },
  { name: "Style", scenario: "idle", click: "Me>Style" },
  { name: "Pool", scenario: "idle", click: "Champions>Pool" },
  { name: "New", scenario: "idle", click: "Champions>Try new" },
  { name: "Month", scenario: "idle", click: "Me>This month" },
  { name: "MyGames", scenario: "idle", click: "Me>My games" },
  { name: "Browse", scenario: "idle", click: "Champions>Browse" },
  { name: "Browse-Runes", scenario: "idle", click: "Champions>Browse>Ahri" },
  { name: "Browse-Build", scenario: "idle", click: "Champions>Browse>Ahri>Build" },
  { name: "Browse-Matchups", scenario: "idle", click: "Champions>Browse>Ahri>Matchups" },
  { name: "NextGame", scenario: "lobby" },
];

/** Screenshot (440 × 720, zoom 1) and view dump of every screen, with each screen's scroll overflow. */
async function screens(outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const overflow: Record<string, number | null> = {};
  for (const s of SCREENS) {
    const setup = await scenarioSetup(s.scenario, 0);
    await withMock(setup, 0, async (lcu) => {
      const r = await launch({
        ...baseEnv(setup, lcu, s.connect ? { profile: false, serverUrl: "http://localhost:8788" } : {}),
        LDC_SCREENSHOT: join(outDir, `${s.name}.png`),
        LDC_VIEW_DUMP: join(outDir, `${s.name}.json`),
        LDC_SCREENSHOT_DELAY_MS: "6000",
        ...(s.click ? { LDC_SCREENSHOT_CLICK: s.click } : {}),
      });
      const m = /scroll overflow (-?\d+|null)px/.exec(r.stdout);
      overflow[s.name] = m && m[1] !== "null" ? Number(m[1]) : null;
      for (const c of s.click?.split(">") ?? []) if (!r.stdout.includes(`clicked "${c}": true`)) console.warn(`${s.name}: "${c}" was not found`);
    });
    process.stdout.write(`screen ${s.name}: overflow ${overflow[s.name]}px\n`);
  }
  writeFileSync(join(outDir, "overflow.json"), JSON.stringify(overflow, null, 2));
}

/**
 * Browse and My games on a bigger synthetic world than the regression screens': each shot's screenshot, overflow and
 * what the state leaves out (LDC_EXPLORE_DUMP), to compare with `meta`. `old`: a snapshot from before bans and builds;
 * `empty`: a history with no games. `closed`: no client at all, on a port nothing listens to.
 */
async function exploreShots(outDir: string, meta: string, old: string, hist: string, empty: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const shots: { name: string; click: string; meta?: string | null; history?: string; closed?: boolean }[] = [
    { name: "list", click: "Champions>Browse" },
    { name: "list-support-pick", click: "Champions>Browse>Support>Pick" },
    { name: "list-ban", click: "Champions>Browse>Ban" },
    { name: "search", click: "Champions>Browse>type:KAI'SA" },
    { name: "search-none", click: "Champions>Browse>type:zzz" },
    { name: "long-name-runes", click: "Champions>Browse>type:nunu>Nunu & Willump" },
    { name: "long-name-build", click: "Champions>Browse>type:nunu>Nunu & Willump>Build" },
    { name: "thin-runes", click: "Champions>Browse>type:kaisa>Kai'Sa" },
    { name: "thin-build", click: "Champions>Browse>type:kaisa>Kai'Sa>Build" },
    { name: "ahri-runes", click: "Champions>Browse>type:ahri>Ahri" },
    { name: "ahri-build", click: "Champions>Browse>type:ahri>Ahri>Build" },
    { name: "ahri-matchups", click: "Champions>Browse>type:ahri>Ahri>Matchups" },
    { name: "back-keeps-search", click: "Champions>Browse>Pick>type:ahri>Ahri>‹ Back" },
    { name: "old-list", click: "Champions>Browse", meta: old },
    { name: "old-detail", click: "Champions>Browse>Ahri", meta: old },
    { name: "no-snapshot", click: "Champions>Browse", meta: null },
    { name: "games", click: "Me>My games" },
    { name: "games-by-champion", click: "Me>My games>By champion" },
    { name: "games-by-champion-open", click: "Me>My games>By champion>Ahri" },
    { name: "games-closed-client", click: "Me>My games", closed: true },
    { name: "games-empty", click: "Me>My games", history: empty },
  ];
  const overflow: Record<string, string> = {};
  for (const s of shots) {
    const setup: Setup = { fixture: idleFixture("None"), meta: s.meta === null ? null : (s.meta ?? meta), timeScale: 0 };
    const shoot = async (lcu: string) => {
      const r = await launch({
        ...baseEnv(setup, lcu),
        LDC_PROFILE_FILE: s.history ?? hist,
        LDC_SCREENSHOT: join(outDir, `g-${s.name}.png`),
        LDC_EXPLORE_DUMP: join(outDir, `g-${s.name}.json`),
        LDC_SCREENSHOT_DELAY_MS: "6000",
        LDC_SCREENSHOT_CLICK: s.click,
      });
      const m = /scroll overflow (-?\d+|null)px/.exec(r.stdout);
      overflow[s.name] = m?.[1] ?? "?";
      for (const c of s.click.split(">")) if (!r.stdout.includes(`clicked "${c}": true`)) console.warn(`${s.name}: "${c}" was not found`);
    };
    if (s.closed) await shoot("1:closed");
    else await withMock(setup, 0, shoot);
    process.stdout.write(`${s.name}: overflow ${overflow[s.name]}px\n`);
  }
  writeFileSync(join(outDir, "g-overflow.json"), JSON.stringify(overflow, null, 2));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "explore") await exploreShots(args[0]!, args[1]!, args[2]!, args[3]!, args[4]!);
else if (cmd === "startup") await startup(Number(args[0] ?? 10), args[1]!);
else if (cmd === "replay") await replay(args[0]!, Number(args[1] ?? 60), args[2]!, args[3] ? (JSON.parse(args[3]) as string[]) : [], Number(args[4] ?? 1));
else if (cmd === "screens") await screens(args[0]!);
else {
  console.log("Usage: tsx scripts/perf/desktop.ts startup <runs> <out> | replay <scenario> <seconds> <out> [clicks] [rounds] | screens <outDir>");
  process.exit(1);
}
