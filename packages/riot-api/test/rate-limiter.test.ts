import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRateLimitCount, parseRateLimitHeader, RateLimiter, type Priority } from "../src/index";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const headers = (app: string, method: string, extra: Record<string, string> = {}) =>
  new Headers({
    "x-app-rate-limit": app,
    "x-app-rate-limit-count": "1:1",
    "x-method-rate-limit": method,
    "x-method-rate-limit-count": "1:1",
    ...extra,
  });

describe("header parsing", () => {
  it("parses limit and count headers", () => {
    expect(parseRateLimitHeader("20:1,100:120")).toEqual([
      { max: 20, windowMs: 1000 },
      { max: 100, windowMs: 120000 },
    ]);
    expect([...parseRateLimitCount("3:1,40:120")]).toEqual([
      [1000, 3],
      [120000, 40],
    ]);
    expect(parseRateLimitHeader(null)).toEqual([]);
    expect(parseRateLimitHeader("bad,5:x,3:2")).toEqual([{ max: 3, windowMs: 2000 }]);
  });
});

describe("RateLimiter", () => {
  /** Runs `n` requests and records the fake time each one started. */
  function harness(responder: (i: number) => Response) {
    const limiter = new RateLimiter();
    const started: { label: string; at: number }[] = [];
    let i = 0;
    const call = (label: string, priority: Priority = "user", method = "m1") =>
      limiter.schedule({ appScope: "host", methodScope: `host|${method}`, priority }, async () => {
        started.push({ label, at: Date.now() });
        return responder(i++);
      });
    return { limiter, started, call };
  }

  it("allows only one request in flight until limits are learned, then follows them", async () => {
    const { started, call } = harness(() => new Response("{}", { headers: headers("3:1", "100:1") }));
    const all = Promise.all(["a", "b", "c", "d", "e"].map((l) => call(l)));
    await vi.runAllTimersAsync();
    await all;
    const at = started.map((s) => s.at);
    // First request learns "3 per second"; the next two go immediately, then wait for the window.
    expect(at.slice(0, 3)).toEqual([0, 0, 0]);
    expect(at[3]).toBeGreaterThanOrEqual(1000);
    expect(at[4]).toBeGreaterThanOrEqual(1000);
  });

  it("uses the server's counts so requests made elsewhere are respected", async () => {
    // Server says 2 of 2 already used in this window.
    const { started, call } = harness(
      () => new Response("{}", { headers: headers("2:1", "100:1", { "x-app-rate-limit-count": "2:1" }) }),
    );
    const all = Promise.all([call("a"), call("b")]);
    await vi.runAllTimersAsync();
    await all;
    expect(started[1]!.at).toBeGreaterThanOrEqual(1000);
  });

  it("serves user requests before queued collector requests", async () => {
    const { started, call } = harness(() => new Response("{}", { headers: headers("1:1", "100:1") }));
    const jobs = [call("c1", "collector"), call("c2", "collector"), call("c3", "collector"), call("u1", "user")];
    await vi.runAllTimersAsync();
    await Promise.all(jobs);
    // c1 was already running when u1 arrived; u1 must be next.
    expect(started.map((s) => s.label)).toEqual(["c1", "u1", "c2", "c3"]);
  });

  it("waits Retry-After on 429 and retries", async () => {
    const { started, call } = harness((i) =>
      i === 0
        ? new Response("", { status: 429, headers: headers("100:1", "100:1", { "retry-after": "7", "x-rate-limit-type": "method" }) })
        : new Response("{}", { headers: headers("100:1", "100:1") }),
    );
    const p = call("a");
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(200);
    expect(started.map((s) => s.at)).toEqual([0, 7000]);
  });

  it("a method 429 does not block other methods, an application 429 blocks all", async () => {
    const run = async (type: string) => {
      vi.setSystemTime(0);
      const { started, call } = harness((i) =>
        i === 0
          ? new Response("", { status: 429, headers: headers("100:1", "100:1", { "retry-after": "5", "x-rate-limit-type": type }) })
          : new Response("{}", { headers: headers("100:1", "100:1") }),
      );
      const a = call("a", "user", "m1");
      await vi.advanceTimersByTimeAsync(10);
      const b = call("b", "user", "m2");
      await vi.runAllTimersAsync();
      await Promise.all([a, b]);
      return started.find((s) => s.label === "b")!.at;
    };
    expect(await run("method")).toBeLessThan(1000);
    expect(await run("application")).toBeGreaterThanOrEqual(5000);
  });

  it("gives up after max retries and returns the 429", async () => {
    const limiter = new RateLimiter({ maxRetries: 2, fallbackBackoffMs: 100 });
    let calls = 0;
    const p = limiter.schedule({ appScope: "h", methodScope: "h|m", priority: "user" }, async () => {
      calls++;
      return new Response("", { status: 429 });
    });
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(429);
    expect(calls).toBe(3);
  });

  it("propagates network errors and keeps going", async () => {
    const limiter = new RateLimiter();
    const bad = limiter.schedule({ appScope: "h", methodScope: "h|m", priority: "user" }, async () => {
      throw new Error("offline");
    });
    const badResult = bad.catch((e: unknown) => e); // observe before timers run
    const good = limiter.schedule({ appScope: "h", methodScope: "h|m", priority: "user" }, async () => new Response("{}"));
    await vi.runAllTimersAsync();
    expect(await badResult).toEqual(new Error("offline"));
    expect((await good).status).toBe(200);
  });
});
