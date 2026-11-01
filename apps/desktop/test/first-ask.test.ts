import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { firstAsk } from "../src/main/first-ask";

describe("firstAsk", () => {
  it("waits for the page to ask", async () => {
    const ipc = new EventEmitter();
    let done = false;
    const asked = firstAsk(ipc, "ready", 10_000).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    ipc.emit("ready");
    await asked;
    expect(done).toBe(true);
  });

  it("doesn't wait for ever for a page that never asks", async () => {
    await expect(firstAsk(new EventEmitter(), "ready", 10)).resolves.toBeUndefined();
  });
});
