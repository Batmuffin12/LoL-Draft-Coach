/**
 * The main process's hot paths, measured in Node (`pnpm perf` runs it: tsx apps/desktop/bench/coach.bench.ts [out.json]):
 * loading a 1,000-game history into the coach, a new meta snapshot, and a champ select update.
 * Synthetic data from packages/sim; Data Dragon from the perf profile's cache when there is one.
 */
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector, sanitizeChampSelect, type ChampSelectSession } from "@ldc/lcu";
import { history, loadScenario } from "@ldc/sim";
import { findConfigDir, loadConfig } from "../src/main/config";
import { PersonalCoach } from "../src/main/personal-coach";
import { profileFromMatches } from "../src/main/profile";
import { fakeDdragonFetch } from "../test/helpers";
import { measure, save } from "../../../scripts/perf/microbench";

const config = loadConfig(findConfigDir(import.meta.dirname));
const cache = join(import.meta.dirname, "..", "..", "..", ".local", "perf-profile", "ddragon");
const cacheDir = mkdtempSync(join(tmpdir(), "ldc-bench-dd-"));
if (existsSync(cache)) cpSync(cache, cacheDir, { recursive: true });
const offline = (async () => {
  throw new Error("offline");
}) as unknown as typeof fetch;
const ddragon = new DataDragon({ cacheDir, fetch: existsSync(cache) ? offline : fakeDdragonFetch() });
await ddragon.load();

const h = history({ now: Date.now(), games: config.app.history.matchCount, days: 365 });
const pickTurn = await loadScenario("mid-counter");
const locked = await loadScenario("locked-solid");
/** The draft at a scenario's stop point (all frames applied). */
const finalDraft = (s: typeof pickTurn) => {
  const session = s.draft.frames.filter((f) => f.uri === "/lol-champ-select/v1/session").at(-1)?.data ?? s.draft.snapshots["/lol-champ-select/v1/session"];
  return sanitizeChampSelect(session as ChampSelectSession);
};

/** A coach with Data Dragon loaded and no client (the LCU connector is never started). */
function coach() {
  const c = new PersonalCoach({ connector: new LcuConnector({ discover: async () => null }), ddragon, config, profiles: null, riotId: null });
  // Internals, driven directly: these are the handlers the profile, meta and LCU events call.
  return c as unknown as { setBand(b: number): void; setProfile(p: unknown): void; setSnapshot(s: unknown): void; onDraft(): void; draft: unknown };
}

const profile = () => profileFromMatches(h.matches, h.masteries);
const warm = coach();
warm.setBand(pickTurn.meta!.band);
warm.setSnapshot(pickTurn.meta!);
warm.setProfile(profile());

await measure("coach: profile from 1,000 games (profileFromMatches)", () => profile());
await measure(
  "coach: load a 1,000-game history (setProfile)",
  () => {
    const c = coach();
    c.setBand(pickTurn.meta!.band);
    c.setSnapshot(pickTurn.meta!);
    c.setProfile(profile());
  },
  { runs: 10, warmup: 1 },
);
await measure("coach: new meta snapshot (setSnapshot)", () => warm.setSnapshot(pickTurn.meta!), { runs: 10, warmup: 1 });
await measure("coach: champ select update, pick turn (onDraft)", () => {
  warm.draft = finalDraft(pickTurn);
  warm.onDraft();
});
await measure("coach: champ select update, locked in (onDraft)", () => {
  warm.draft = finalDraft(locked);
  warm.onDraft();
});
save();
