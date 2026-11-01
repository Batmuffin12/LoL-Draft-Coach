import { beforeEach, describe, expect, it, vi } from "vitest";
import { logProblem } from "../src/main/problem-log";
import { ServerError } from "../src/main/server-client";
import { logUnexpected, retryDelay, SERVER_RETRY_DELAYS_MS, serverProblem, serverProblemText } from "../src/main/server-problem";

vi.mock("../src/main/problem-log", () => ({ logProblem: vi.fn() }));

describe("serverProblem", () => {
  it("words each kind of failure, and says it tries again without a time that would go stale on screen", () => {
    const say = (code: string, status = 0) => serverProblem(new ServerError(status, code, `raw ${code}`));
    expect(say("asleep", 503)).toBe("The coach server is still starting up. Trying again automatically.");
    expect(say("timeout")).toBe("The coach server didn't answer in time. Trying again automatically.");
    expect(say("unreachable")).toBe("Can't reach the coach server: check your internet connection. Trying again automatically.");
    expect(say("server_error", 500)).toBe("The coach server had a problem (HTTP 500). Trying again automatically.");
    expect(say("bad_response", 200)).toMatch(/^The coach server sent something this app doesn't understand/);
    // The server's own message for anything else (e.g. a refused request).
    expect(say("rate_limited", 429)).toBe("raw rate_limited Trying again automatically.");
    // Anything else is never shown raw.
    expect(serverProblem(new Error("boom"))).toBe("Something went wrong talking to the coach server. Trying again automatically.");
  });

  it("never shows the address, the cause or a validation dump", () => {
    const raw = "Can't reach the coach server at https://coach.example (fetch failed).";
    expect(serverProblemText(new ServerError(0, "unreachable", raw))).toBe("Can't reach the coach server: check your internet connection.");
    const dump = serverProblemText(new ServerError(200, "bad_response", "The server sent an unexpected response:\n✖ Invalid input\n  → at user.id"));
    expect(dump).not.toMatch(/Invalid input|\n/);
    expect(serverProblemText(new TypeError("Cannot read properties of undefined"))).not.toMatch(/undefined/);
  });
});

describe("logUnexpected", () => {
  beforeEach(() => vi.mocked(logProblem).mockClear());

  it("logs the technical detail of unusual failures", () => {
    logUnexpected("Registering", new ServerError(200, "bad_response", "dump"));
    logUnexpected("Registering", new ServerError(500, "server_error", "HTTP 500"));
    logUnexpected("Registering", new TypeError("boom"));
    expect(vi.mocked(logProblem).mock.calls.map((c) => c[0])).toEqual(["Registering: dump", "Registering: HTTP 500", "Registering: boom"]);
  });

  it("keeps everyday failures out of them", () => {
    for (const code of ["unreachable", "timeout", "asleep", "invite_invalid", "no_snapshot"]) logUnexpected("x", new ServerError(0, code, "m"));
    expect(logProblem).not.toHaveBeenCalled();
  });
});

describe("retryDelay", () => {
  it("waits longer after each failure in a row, up to the last wait", () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => retryDelay(n))).toEqual([...SERVER_RETRY_DELAYS_MS, SERVER_RETRY_DELAYS_MS.at(-1)!, SERVER_RETRY_DELAYS_MS.at(-1)!]);
    expect(retryDelay(3, [5, 10])).toBe(10);
  });
});
