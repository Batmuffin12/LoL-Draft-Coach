import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AdviceRecord } from "@ldc/shared";
import { AccountStore, type SecretBox } from "../src/main/account-store";
import { AdviceStore } from "../src/main/advice-store";
import { ServerProfileSource } from "../src/main/profile-source";

const box: SecretBox = { encrypt: (s) => `x:${s}`, decrypt: (s) => s.slice(2) };
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

const record = (gameId: number): AdviceRecord =>
  ({ gameId, queueId: 420, role: "middle", band: 2, lockedAt: 1_000 + gameId, pick: { championId: 103, expectedWin: 0.52, terms: [] }, shown: [] }) as unknown as AdviceRecord;

/** A coach server that is down until `up` is set, and records the advice it receives. */
function fakeServer() {
  const state = { up: false, refuse: new Set<number>(), received: [] as number[] };
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    if (!state.up) throw new TypeError("fetch failed");
    const body = JSON.parse(String(init?.body)) as { gameId: number };
    if (state.refuse.has(body.gameId)) return new Response(JSON.stringify({ error: "invalid", message: "bad" }), { status: 400 });
    state.received.push(body.gameId);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return { state, fetchFn };
}

async function registeredSource(fetchFn: typeof fetch, dir: string) {
  const accounts = new AccountStore(join(dir, "account.json"), box);
  await accounts.save({ serverUrl: "https://coach.test", token: "T", riotId: "Ofek#EUW" });
  const outbox = new AdviceStore(join(dir, "outbox.json"));
  const s = new ServerProfileSource({ accounts, defaultServerUrl: null, fetch: fetchFn, sleep: async () => {}, outbox });
  await s.init();
  return { s, outbox };
}

describe("advice outbox (server mode)", () => {
  it("keeps advice the server didn't get, across restarts, and sends it once the server is back", async () => {
    const dir = tmp("ldc-outbox-");
    const server = fakeServer();
    const first = await registeredSource(server.fetchFn, dir);
    const shown: AdviceRecord[][] = [];
    first.s.on("advice", (a) => shown.push(a));
    await first.s.recordAdvice(record(1));
    expect(shown.at(-1)?.map((a) => a.gameId)).toEqual([1]);
    expect((await first.outbox.list()).map((a) => a.gameId)).toEqual([1]);

    // The app restarts; the server is back. The next record sends both, oldest first.
    server.state.up = true;
    const second = await registeredSource(server.fetchFn, dir);
    await second.s.recordAdvice(record(2));
    expect(server.state.received).toEqual([1, 2]);
    expect(await second.outbox.list()).toEqual([]);
  });

  it("drops a record the server refuses as invalid instead of retrying it forever", async () => {
    const server = fakeServer();
    server.state.up = true;
    server.state.refuse.add(3);
    const { s, outbox } = await registeredSource(server.fetchFn, tmp("ldc-outbox-"));
    await s.recordAdvice(record(3));
    await s.recordAdvice(record(4));
    expect(server.state.received).toEqual([4]);
    expect(await outbox.list()).toEqual([]);
  });

  it("forgets unsent advice on sign-out, so it is never posted for another registration", async () => {
    const server = fakeServer();
    const { s, outbox } = await registeredSource(server.fetchFn, tmp("ldc-outbox-"));
    await s.recordAdvice(record(5));
    await s.signOut();
    expect(await outbox.list()).toEqual([]);
  });
});
