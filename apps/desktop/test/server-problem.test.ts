import { describe, expect, it } from "vitest";
import { ServerError } from "../src/main/server-client";
import { retryDelay, SERVER_RETRY_DELAYS_MS, serverProblem } from "../src/main/server-problem";

describe("serverProblem", () => {
  it("words each kind of failure, with when it tries again", () => {
    const say = (code: string, status = 0) => serverProblem(new ServerError(status, code, `raw ${code}`), 120_000);
    expect(say("asleep", 503)).toBe("The coach server is still starting up. Trying again in 2 min.");
    expect(say("timeout")).toBe("The coach server didn't answer in time. Trying again in 2 min.");
    expect(say("unreachable")).toBe("Can't reach the coach server: check your internet connection. Trying again in 2 min.");
    expect(say("server_error", 500)).toBe("The coach server had a problem (HTTP 500). Trying again in 2 min.");
    expect(say("bad_response", 200)).toMatch(/^The coach server sent something this app doesn't understand/);
    // The server's own message for anything else (e.g. a refused request), and for other errors.
    expect(say("rate_limited", 429)).toBe("raw rate_limited Trying again in 2 min.");
    expect(serverProblem(new Error("boom"), 30_000)).toBe("boom Trying again in 30 s.");
  });
});

describe("retryDelay", () => {
  it("waits longer after each failure in a row, up to the last wait", () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => retryDelay(n))).toEqual([...SERVER_RETRY_DELAYS_MS, SERVER_RETRY_DELAYS_MS.at(-1)!, SERVER_RETRY_DELAYS_MS.at(-1)!]);
    expect(retryDelay(3, [5, 10])).toBe(10);
  });
});
