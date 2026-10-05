import { describe, expect, it } from "vitest";
import { RiotApi, RiotKeyError, RiotSchemaError } from "../src/index";

const okHeaders = { "x-app-rate-limit": "100:1", "x-method-rate-limit": "100:1" };

function fakeRiot(handler: (url: URL) => Response) {
  const calls: { url: URL; token: string | null }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, token: new Headers(init?.headers).get("x-riot-token") });
    return handler(url);
  }) as typeof fetch;
  return { calls, fetchFn };
}

const api = (fetchFn: typeof fetch, keyType: "development" | "personal" = "development") =>
  new RiotApi({ apiKey: "test-key", keyType, platform: "euw1", region: "europe", fetch: fetchFn });

describe("RiotApi", () => {
  it("routes each API to the right host and sends the key header", async () => {
    const { calls, fetchFn } = fakeRiot((url) => {
      if (url.pathname.startsWith("/riot/account")) return Response.json({ puuid: "P", gameName: "A", tagLine: "B" }, { headers: okHeaders });
      if (url.pathname.endsWith("/ids")) return Response.json(["EUW1_2", "EUW1_1"], { headers: okHeaders });
      if (url.pathname.includes("champion-mastery")) return Response.json([{ championId: 1, championLevel: 7, championPoints: 99 }], { headers: okHeaders });
      if (url.pathname.includes("/league/")) return Response.json([{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II" }], { headers: okHeaders });
      return new Response("", { status: 404 });
    });
    const riot = api(fetchFn);
    expect((await riot.accountByRiotId("Some Name", "euw"))?.puuid).toBe("P");
    expect(await riot.matchIdsByPuuid("P", { count: 20, queue: 420 })).toEqual(["EUW1_2", "EUW1_1"]);
    expect((await riot.masteriesByPuuid("P"))[0]?.championPoints).toBe(99);
    expect((await riot.leagueEntriesByPuuid("P"))[0]?.tier).toBe("GOLD");
    expect(await riot.match("EUW1_404")).toBeNull();

    expect(calls.map((c) => `${c.url.host}${c.url.pathname}`)).toEqual([
      "europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Some%20Name/euw",
      "europe.api.riotgames.com/lol/match/v5/matches/by-puuid/P/ids",
      "euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/P",
      "euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/P",
      "europe.api.riotgames.com/lol/match/v5/matches/EUW1_404",
    ]);
    expect(calls[1]!.url.searchParams.get("count")).toBe("20");
    expect(calls[1]!.url.searchParams.get("queue")).toBe("420");
    expect(calls.every((c) => c.token === "test-key")).toBe(true);
  });

  it("explains an expired development key and then fails fast", async () => {
    const { calls, fetchFn } = fakeRiot(() =>
      Response.json({ status: { message: "Unknown apikey", status_code: 401 } }, { status: 401 }),
    );
    const riot = api(fetchFn);
    const err = await riot.accountByRiotId("a", "b").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RiotKeyError);
    expect((err as Error).message).toMatch(/expire every 24 hours/);
    expect((err as Error).message).toMatch(/developer\.riotgames\.com/);
    await expect(riot.masteriesByPuuid("p")).rejects.toBeInstanceOf(RiotKeyError);
    expect(calls).toHaveLength(1);
    expect(riot.keyProblem).not.toBeNull();
  });

  it("treats 403 as a key problem too, worded for personal keys", async () => {
    const { fetchFn } = fakeRiot(() => new Response("", { status: 403 }));
    const err = await api(fetchFn, "personal").match("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RiotKeyError);
    expect((err as Error).message).toMatch(/personal API key/);
  });

  it("refuses to call without a key", async () => {
    const { calls, fetchFn } = fakeRiot(() => Response.json({}));
    const riot = new RiotApi({ apiKey: "", keyType: "development", platform: "euw1", region: "europe", fetch: fetchFn });
    await expect(riot.match("x")).rejects.toThrow(/Set RIOT_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("fails clearly when a response changes shape", async () => {
    const { fetchFn } = fakeRiot(() => Response.json({ metadata: { matchId: "x" }, info: { queueId: "ranked" } }, { headers: okHeaders }));
    await expect(api(fetchFn).match("x")).rejects.toBeInstanceOf(RiotSchemaError);
  });

  it("lists ranked players by tier and division on the platform host", async () => {
    const { calls, fetchFn } = fakeRiot(() =>
      Response.json([{ puuid: "P1", queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: 40 }], { headers: okHeaders }),
    );
    const players = await api(fetchFn).leaguePlayers({ queue: "RANKED_SOLO_5x5", tier: "GOLD", division: "II", page: 3 });
    expect(players).toEqual([expect.objectContaining({ puuid: "P1", tier: "GOLD" })]);
    expect(`${calls[0]!.url.host}${calls[0]!.url.pathname}${calls[0]!.url.search}`).toBe(
      "euw1.api.riotgames.com/lol/league/v4/entries/RANKED_SOLO_5x5/GOLD/II?page=3",
    );
  });
});
