/** Fake Data Dragon CDN that knows a few champions from the fixture. */
export function fakeDdragonFetch(): typeof fetch {
  const champs: Record<string, [string, string]> = {
    "86": ["Garen", "Garen"],
    "103": ["Ahri", "Ahri"],
    "54": ["Malphite", "Malphite"],
  };
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("versions.json")) return Response.json(["9.9.1"]);
    if (url.endsWith("champion.json")) {
      return Response.json({
        version: "9.9.1",
        data: Object.fromEntries(
          Object.entries(champs).map(([key, [id, name]]) => [id, { id, key, name, image: { full: `${id}.png` } }]),
        ),
      });
    }
    if (url.endsWith("item.json") || url.endsWith("summoner.json")) return Response.json({ data: {} });
    if (url.endsWith("runesReforged.json")) return Response.json([]);
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}

export const waitFor = async (cond: () => boolean, timeoutMs = 5_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

export const LOCAL_PUUID = "mock-local-player";

/**
 * Fake Riot API: the local player has played a few mid champions; the other nine
 * participants give the engine attribute samples. Returns 401 for every call when
 * `expiredKey` is set.
 */
export function fakeRiotFetch(opts: { expiredKey?: boolean; myChamps?: [number, string, boolean][] } = {}) {
  const calls: string[] = [];
  // [championId, position, win]
  const mine: [number, string, boolean][] = opts.myChamps ?? [
    ...Array.from({ length: 6 }, (_, i): [number, string, boolean] => [103, "MIDDLE", i < 4]),
    ...Array.from({ length: 5 }, (_, i): [number, string, boolean] => [245, "MIDDLE", i < 3]),
    ...Array.from({ length: 5 }, (_, i): [number, string, boolean] => [238, "MIDDLE", i < 4]),
    ...Array.from({ length: 3 }, (_, i): [number, string, boolean] => [84, "MIDDLE", i < 1]),
    ...Array.from({ length: 4 }, (_, i): [number, string, boolean] => [51, "BOTTOM", i < 3]),
  ];
  const others = [86, 32, 51, 111, 54, 59, 21, 25, 122];
  const ids = mine.map((_, i) => `EUW1_${1000 + i}`);
  const headers = { "x-app-rate-limit": "100:1", "x-method-rate-limit": "100:1" };
  const participant = (puuid: string, championId: number, pos: string, win: boolean, magic: boolean) => ({
    puuid,
    riotIdGameName: `name-${puuid}`,
    championId,
    teamId: 100,
    teamPosition: pos,
    win,
    physicalDamageDealtToChampions: magic ? 2000 : 18000,
    magicDamageDealtToChampions: magic ? 18000 : 2000,
    trueDamageDealtToChampions: 500,
    totalDamageTaken: championId === 54 || championId === 111 ? 40000 : 15000,
    damageSelfMitigated: championId === 54 || championId === 111 ? 30000 : 5000,
    timeCCingOthers: championId === 111 || championId === 32 ? 50 : 8,
  });
  const fetchFn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (opts.expiredKey) return Response.json({ status: { message: "Unknown apikey", status_code: 401 } }, { status: 401 });
    if (url.pathname.includes("champion-mastery")) {
      return Response.json([{ championId: 103, championLevel: 7, championPoints: 250000 }, { championId: 84, championLevel: 5, championPoints: 40000 }], { headers });
    }
    if (url.pathname.includes("/league/")) return Response.json([{ queueType: "RANKED_SOLO_5x5", tier: "PLATINUM", rank: "II" }], { headers });
    if (url.pathname.includes("/accounts/by-riot-id/")) return Response.json({ puuid: LOCAL_PUUID, gameName: "Me", tagLine: "EUW" }, { headers });
    if (url.pathname.endsWith("/ids")) return Response.json(url.searchParams.get("queue") === "420" ? ids : [], { headers });
    const m = /\/matches\/EUW1_(\d+)$/.exec(url.pathname);
    if (m) {
      const i = Number(m[1]) - 1000;
      const [champ, pos, win] = mine[i]!;
      return Response.json(
        {
          metadata: { matchId: `EUW1_${m[1]}`, participants: [LOCAL_PUUID] },
          info: {
            gameCreation: Date.now() - (i + 1) * 3_600_000,
            gameDuration: 1800,
            gameEndTimestamp: Date.now() - (i + 1) * 3_600_000 + 1_800_000,
            gameVersion: "16.19.1",
            queueId: 420,
            participants: [
              participant(LOCAL_PUUID, champ, pos, win, champ !== 51 && champ !== 238),
              ...others.map((c, k) => participant(`other-${k}`, c, ["TOP", "JUNGLE", "BOTTOM", "UTILITY", "TOP", "JUNGLE", "BOTTOM", "UTILITY", "TOP"][k]!, k % 2 === 0, c === 25)),
            ],
          },
        },
        { headers },
      );
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { calls, fetchFn };
}
