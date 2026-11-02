/**
 * A local stand-in for the Data Dragon and CommunityDragon CDNs, so cold starts can be measured with
 * a chosen network delay and nothing real is asked. It serves a copy of a panel's Data Dragon cache
 * (any profile's `ddragon` folder). Only versions.json is delayed: it's the request every start makes.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

/** Milliseconds before versions.json answers, or "hang": it never does. */
export type StubDelay = number | "hang";

/** The shape of the tail seen from the real CDN over 2,000 cold starts (v1.0.3 and v1.0.4), per thousand starts. */
const TAIL: [perMille: number, ms: number][] = [
  [900, 65],
  [980, 90],
  [995, 400],
  [999, 1_500],
  [1_000, 10_600],
];

/** The delay of one measured start: `setting` is a number, "hang" or "tail" (each thousand starts in a row get the whole tail, spread out). */
export function stubDelay(setting: string, start: number): StubDelay {
  if (setting === "hang") return "hang";
  if (setting !== "tail") return Number(setting);
  const slot = (start * 7) % 1_000;
  return TAIL.find(([perMille]) => slot < perMille)![1];
}

export async function startDdragonStub(dir: string) {
  const { version, locale } = JSON.parse(readFileSync(join(dir, "current.json"), "utf8")) as { version: string; locale: string };
  const files = join(dir, `${version}_${locale}`);
  const shards = JSON.parse(readFileSync(join(files, "statShards.json"), "utf8")) as { styles: unknown; perks: unknown };
  let delay: StubDelay = 0;
  const server = createServer((req, res) => {
    const send = (body: string | Buffer, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body);
    };
    const url = req.url ?? "";
    if (url.endsWith("/api/versions.json")) {
      if (delay !== "hang") setTimeout(() => send(JSON.stringify([version])), delay);
      return;
    }
    const file = /\/cdn\/[^/]+\/data\/[^/]+\/(\w+\.json)$/.exec(url);
    if (file) return send(readFileSync(join(files, file[1]!)));
    if (url.endsWith("/cdragon/v1/perkstyles.json")) return send(JSON.stringify(shards.styles));
    if (url.endsWith("/cdragon/v1/perks.json")) return send(JSON.stringify(shards.perks));
    send("{}", 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    setDelay: (d: StubDelay) => void (delay = d),
    stop: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
