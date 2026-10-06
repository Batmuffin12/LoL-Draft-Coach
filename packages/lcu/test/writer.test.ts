import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IMPORT_PREFIX, LcuImporter, LcuWriteError } from "../src/index";
import { loadFixture, MockLcuServer } from "../src/testing";

let server: MockLcuServer | null = null;
let importer: LcuImporter | null = null;
afterEach(async () => {
  importer?.close();
  await server?.stop();
  server = null;
  importer = null;
});

async function start(overrides: Record<string, unknown> = {}) {
  server = new MockLcuServer(loadFixture("synthetic-draft-pick"), {
    "/lol-perks/v1/pages": [{ id: 1, name: "My own page", isEditable: true }],
    "/lol-summoner/v1/current-summoner": { summonerId: 42 },
    "/lol-item-sets/v1/item-sets/42/sets": { accountId: 42, itemSets: [{ uid: "mine", title: "My set" }], timestamp: 1 },
    ...overrides,
  });
  importer = new LcuImporter(await server.start());
  return server;
}

const page = { name: "Ahri", primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8138, 8135, 8226, 8210, 5005, 5008, 5001] };

describe("LcuImporter (click-only rune page and item set import)", () => {
  it("creates a rune page once, then replaces its own page instead of adding more", async () => {
    const s = await start();
    expect(await importer!.importRunePage(page)).toBe("created");
    expect(await importer!.importRunePage({ ...page, name: "Zed" })).toBe("replaced");
    expect(s.writes.map((w) => `${w.method} ${w.path}`)).toEqual(["POST /lol-perks/v1/pages", "PUT /lol-perks/v1/pages/1001"]);
    expect(s.writes[0]!.body).toMatchObject({ name: `${IMPORT_PREFIX}Ahri`, primaryStyleId: 8100, selectedPerkIds: page.selectedPerkIds, current: true });
  });

  it("says when every rune page slot is in use", async () => {
    const s = await start();
    s.maxPages = 1;
    await expect(importer!.importRunePage(page)).rejects.toMatchObject({ reason: "pagesFull" });
  });

  it("writes the champion's item set and keeps the player's other sets", async () => {
    const s = await start();
    const set = { title: "Ahri middle", championId: 103, mapId: 11, blocks: [{ type: "Start", items: [1056, 2003, 2003] }, { type: "Build", items: [6655, 3020] }] };
    await importer!.importItemSet(set);
    await importer!.importItemSet(set);
    const body = s.writes.at(-1)!.body as { itemSets: { uid: string; blocks: { items: { id: string; count: number }[] }[] }[] };
    expect(body.itemSets.map((x) => x.uid)).toEqual(["mine", "ldc-103"]);
    expect(body.itemSets[1]!.blocks[0]!.items).toEqual([
      { id: "1056", count: 1 },
      { id: "2003", count: 2 },
    ]);
  });

  it("refuses every other write, champ select above all", async () => {
    await start();
    for (const [method, path] of [
      ["POST", "/lol-champ-select/v1/session/actions/1/complete"],
      ["PUT", "/lol-champ-select/v1/session/actions/1"],
      ["POST", "/lol-perks/v1/pages/1"],
      ["PUT", "/lol-perks/v1/currentpage"],
    ] as const) {
      await expect(importer!.write(method, path, {})).rejects.toBeInstanceOf(LcuWriteError);
    }
    expect(server!.writes).toEqual([]);
  });

  it("is the only module that can write to the client", () => {
    const dir = join(__dirname, "..", "src");
    for (const f of readdirSync(dir)) {
      if (f === "writer.ts" || f === "mock-server.ts") continue;
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/method: "(POST|PUT|PATCH|DELETE)"/);
    }
  });
});
