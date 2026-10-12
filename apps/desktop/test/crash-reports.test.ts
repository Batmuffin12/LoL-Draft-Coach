import { describe, expect, it } from "vitest";
import { reportProblem, scrubText, scrubValue, startCrashReports } from "../src/main/crash-reports";

const PUUID = "a".repeat(40) + "B-_9".repeat(9) + "zz";

describe("crash report scrubbing", () => {
  it("removes the Windows user name from paths, in every spelling", () => {
    expect(scrubText("at C:\\Users\\Dana Levi\\AppData\\Local\\x.js:1")).toBe("at C:\\Users\\<user>\\AppData\\Local\\x.js:1");
    expect(scrubText("file:///C:/Users/dana/app.asar/main.cjs")).toBe("file:///C:/Users/<user>/app.asar/main.cjs");
    expect(scrubText('{"path":"C:\\\\Users\\\\dana\\\\x"}')).toBe('{"path":"C:\\\\Users\\\\<user>\\\\x"}');
  });

  it("removes Riot IDs, PUUIDs, match IDs, app tokens and Riot keys", () => {
    expect(PUUID).toHaveLength(78);
    expect(scrubText("Registered as Faker#KR1, not Dana#EUW.")).toBe("Registered as <riot-id>, not <riot-id>.");
    expect(scrubText(`puuid=${PUUID}&x=1`)).toBe("puuid=<puuid>&x=1");
    expect(scrubText("Bearer ldc_AbC-123_x")).toBe("Bearer <token>");
    // A made-up key, assembled so the repo's secret scan doesn't flag it.
    expect(scrubText(`key ${"RGAPI-"}${"12345678-abcd-ef01-2345-6789abcdef01"} rejected`)).toBe("key <riot-key> rejected");
    expect(scrubText("/me/profile?ids=EUW1_7123456789%2CEUW1_7123456790&timelines=1")).toBe("/me/profile?ids=<match>%2C<match>&timelines=1");
    expect(scrubText("match KR_6912345678 failed")).toBe("match <match> failed");
    // Ordinary messages stay readable.
    expect(scrubText("Can't reach the coach server at https://coach.test (ECONNREFUSED).")).toBe("Can't reach the coach server at https://coach.test (ECONNREFUSED).");
  });

  it("scrubs a whole event and drops the user, host name and headers", () => {
    const event = {
      message: "Registered as Me#EUW",
      server_name: "DANAS-PC",
      user: { id: "x", ip_address: "1.2.3.4" },
      request: { url: "https://coach.test/me", headers: { authorization: "Bearer ldc_x" } },
      exception: { values: [{ value: "boom", stacktrace: { frames: [{ filename: "C:\\Users\\dana\\a.js", lineno: 3 }] } }] },
      tags: { band: 2 },
    };
    expect(scrubValue(event)).toEqual({
      message: "Registered as <riot-id>",
      request: { url: "https://coach.test/me" },
      exception: { values: [{ value: "boom", stacktrace: { frames: [{ filename: "C:\\Users\\<user>\\a.js", lineno: 3 }] } }] },
      tags: { band: 2 },
    });
  });
});

describe("startCrashReports", () => {
  it("starts the SDK without personal data, scrubs every event, and reports problems once started", () => {
    const calls: { init?: Record<string, unknown>; messages: [string, string][] } = { messages: [] };
    reportProblem("before start: dropped");
    const fake = { init: (o: Record<string, unknown>) => (calls.init = o), captureMessage: (m: string, l: string) => calls.messages.push([m, l]) };
    startCrashReports("https://key@o0.ingest.sentry.io/1", "1.0.0", () => fake as never);
    expect(calls.init).toMatchObject({ dsn: "https://key@o0.ingest.sentry.io/1", release: "1.0.0", sendDefaultPii: false });
    const beforeSend = calls.init!.beforeSend as (e: unknown) => unknown;
    expect(beforeSend({ message: "Me#EUW", user: { id: 1 } })).toEqual({ message: "<riot-id>" });
    reportProblem("Server config rejected for Me#EUW");
    expect(calls.messages).toEqual([["Server config rejected for <riot-id>", "warning"]]);
  });
});
