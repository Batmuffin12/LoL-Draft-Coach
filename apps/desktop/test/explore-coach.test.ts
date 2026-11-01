import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import type { MetaSnapshot } from "@ldc/shared";
import { findConfigDir, loadConfig } from "../src/main/config";
import { MetaSource } from "../src/main/meta-source";
import { PersonalCoach } from "../src/main/personal-coach";
import { fakeDdragonFetch, waitFor } from "./helpers";

const config = loadConfig(findConfigDir(__dirname));
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

const snapshot = (champions: number): MetaSnapshot => ({
  format: 1,
  band: config.bands.defaultBand,
  createdAt: 1000,
  patch: "16.19",
  matches: 10_000,
  newestMatchAt: null,
  halfLifeDays: 14,
  roleGames: { middle: 20_000 },
  champions: Array.from({ length: champions }, (_, i) => ({ championId: i + 1, role: "middle", games: 100 + i, wins: 50, n: 100 + i })),
  matchups: [],
  duos: [],
  attributes: [],
  references: {},
});

let coach: PersonalCoach | null = null;
afterEach(() => coach?.stop());

async function started(meta: MetaSnapshot | null): Promise<PersonalCoach> {
  const source = meta ? new MetaSource({ client: () => null, cacheDir: tmp("ldc-meta-"), fixed: meta }) : null;
  coach = new PersonalCoach({
    connector: new LcuConnector({ discover: async () => null, pollIntervalMs: 1000 }),
    ddragon: new DataDragon({ cacheDir: tmp("ldc-dd-"), fetch: fakeDdragonFetch() }),
    config,
    profiles: null,
    riotId: null,
    meta: source,
  });
  await coach.start();
  if (source) {
    await source.refresh(config.bands.defaultBand);
    await waitFor(() => coach!.explore.list() !== null);
  }
  return coach;
}

/** What gets pushed to the panel, without the clock. */
const stateSize = (c: PersonalCoach) => JSON.stringify(c.state).length;

describe("explore through the coach", () => {
  it("the state pushed to the panel doesn't grow with the list, or from using it", async () => {
    const small = stateSize(await started(snapshot(3)));
    coach!.stop();
    const c = await started(snapshot(400));
    expect(stateSize(c)).toBe(small);
    expect(c.explore.list()!.rows).toHaveLength(400);
    await c.explore.champion(1, "middle");
    c.explore.games();
    expect(stateSize(c)).toBe(small);
    expect(Object.keys(c.state).filter((k) => /explore|browse|myGames/i.test(k))).toEqual([]);
  });

  it("works the list out once per snapshot", async () => {
    const c = await started(snapshot(5));
    expect(c.explore.list()).toBe(c.explore.list());
  });

  it("without a snapshot there's no list and no champion; without games an empty history", async () => {
    const c = await started(null);
    expect(c.explore.list()).toBeNull();
    expect(await c.explore.champion(1, "middle")).toBeNull();
    expect(c.explore.games().games).toEqual([]);
  });

  it("an older server's config keeps the wording this version bundles", async () => {
    const c = await started(null);
    const templates = Object.fromEntries(Object.entries(config.explain.templates).filter(([k]) => !k.startsWith("ui.explore.") && !k.startsWith("ui.games.") && k !== "ui.tabs.browse"));
    c.setConfig({ ...config, explain: { ...config.explain, templates } });
    expect(c.state.copy["explore.search"]).toBe(config.explain.templates["ui.explore.search"]);
    expect(c.state.copy["tabs.browse"]).toBe("Browse");
    expect(c.state.copy["games.recent"]).toBe(config.explain.templates["ui.games.recent"]);
  });
});
