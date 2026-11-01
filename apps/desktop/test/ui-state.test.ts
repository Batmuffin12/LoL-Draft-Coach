import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UiStateStore } from "../src/main/ui-state";

describe("UiStateStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ldc-ui-state-"));
    file = join(dir, "ui-state.json");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("starts empty without a file", async () => {
    expect(await new UiStateStore(file).load()).toEqual({ tourDone: false, highlightsSeen: [] });
  });

  it.each(["{not json", "null", "[]", '"text"'])("starts empty from a corrupt file: %s", async (text) => {
    await writeFile(file, text);
    expect(await new UiStateStore(file).load()).toEqual({ tourDone: false, highlightsSeen: [] });
  });

  it("keeps the good field when the other is broken", async () => {
    await writeFile(file, JSON.stringify({ tourDone: true, highlightsSeen: "nope" }));
    expect(await new UiStateStore(file).load()).toEqual({ tourDone: true, highlightsSeen: [] });
    await writeFile(file, JSON.stringify({ tourDone: "yes", highlightsSeen: ["me"] }));
    expect(await new UiStateStore(file).load()).toEqual({ tourDone: false, highlightsSeen: ["me"] });
  });

  it("is still there after a restart", async () => {
    const store = new UiStateStore(file);
    await store.load();
    store.finishTour();
    store.sawHighlight("me");
    expect(store.sawHighlight("pick")).toEqual({ tourDone: true, highlightsSeen: ["me", "pick"] });
    await store.flushed();
    expect(await new UiStateStore(file).load()).toEqual({ tourDone: true, highlightsSeen: ["me", "pick"] });
  });

  it("records a highlight once", async () => {
    const store = new UiStateStore(file);
    await store.load();
    store.sawHighlight("me");
    expect(store.sawHighlight("me").highlightsSeen).toEqual(["me"]);
  });

  it("keeps highlights of a newer version", async () => {
    await writeFile(file, JSON.stringify({ tourDone: true, highlightsSeen: ["from-the-future"] }));
    const store = new UiStateStore(file);
    await store.load();
    store.sawHighlight("me");
    await store.flushed();
    expect(JSON.parse(await readFile(file, "utf8")).highlightsSeen).toEqual(["from-the-future", "me"]);
  });

  it("creates its folder, and a failed write doesn't throw", async () => {
    const nested = new UiStateStore(join(dir, "a", "b", "ui-state.json"));
    await nested.load();
    nested.finishTour();
    await nested.flushed();
    expect(await new UiStateStore(join(dir, "a", "b", "ui-state.json")).load()).toMatchObject({ tourDone: true });

    // The path is a file used as a folder: the write fails, the state in memory still holds.
    await writeFile(join(dir, "file"), "");
    const broken = new UiStateStore(join(dir, "file", "ui-state.json"));
    await broken.load();
    expect(broken.finishTour().tourDone).toBe(true);
    await expect(broken.flushed()).resolves.toBeUndefined();
  });
});
