import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DataDragon } from "@ldc/ddragon";
import { LcuConnector } from "@ldc/lcu";
import { loadFixture, MockLcuServer } from "@ldc/lcu/testing";
import { Coach } from "../src/main/coach";
import { readEnv } from "../src/main/env";
import type { ViewState } from "../src/shared/view";
import { fakeDdragonFetch, waitFor } from "./helpers";

let server: MockLcuServer | null = null;
let coach: Coach | null = null;
afterEach(async () => {
  coach?.stop();
  await server?.stop();
});

describe("Coach (mock League client end to end)", () => {
  it("shows the live draft with champion names and no player identities", async () => {
    server = new MockLcuServer(loadFixture("synthetic-draft-pick"));
    const creds = await server.start();
    const connector = new LcuConnector({ discover: async () => creds, pollIntervalMs: 20 });
    const ddragon = new DataDragon({ cacheDir: mkdtempSync(join(tmpdir(), "ldc-c-")), fetch: fakeDdragonFetch() });
    coach = new Coach({ connector, ddragon });
    const states: ViewState[] = [];
    coach.on("state", (s) => states.push(s));
    await coach.start();

    await waitFor(() => coach!.state.status.lcu === "connected" && coach!.state.draft !== null && server!.clientCount === 1);
    expect(coach.state.status.patch).toBe("9.9.1");
    // Planning: local player hovers Ahri.
    const me = coach.state.draft!.myTeam.find((s) => s.isLocalPlayer)!;
    expect(me.hover?.name).toBe("Ahri");
    expect(me.position).toBe("middle");

    // Play until the local player's pick turn.
    while (coach.state.draft?.localAction !== "pick" && server.step()) await new Promise((r) => setTimeout(r, 15));
    expect(coach.state.draft?.localAction).toBe("pick");

    await server.playAll();
    await waitFor(() => coach!.state.draft === null && coach!.state.status.gameflowPhase === "GameStart");

    const full = states.map((s) => s.draft).filter(Boolean).at(-1)!;
    expect(full.myTeam[0]?.champion?.name).toBe("Garen");
    expect(full.theirTeam[0]?.champion?.name).toBe("Malphite");
    // Unknown champion ids still render (by id), never crash.
    expect(full.theirTeam[4]?.champion?.name).toBe("#122");
    // Nothing identity-like ever reaches the view.
    expect(JSON.stringify(states)).not.toMatch(/puuid|summonerId|gameName|tagLine/i);
  });
});

describe("readEnv", () => {
  it("defaults and parses settings", () => {
    const env = readEnv({ RIOT_API_KEY: " k ", RIOT_KEY_TYPE: "personal", JEV_ENABLED: "true" });
    expect(env.riotApiKey).toBe("k");
    expect(env.riotKeyType).toBe("personal");
    expect(env.jevEnabled).toBe(true);
    expect(env.lolInstallDir).toContain("League of Legends");
    expect(readEnv({}).riotKeyType).toBe("development");
    expect(readEnv({}).riotApiKey).toBeNull();
  });
});
