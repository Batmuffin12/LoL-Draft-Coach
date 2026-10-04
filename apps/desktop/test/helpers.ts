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
