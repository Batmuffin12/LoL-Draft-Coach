import { describe, expect, it, vi } from "vitest";
import { logProblem, scrubText } from "../src/main/problem-log";

const PUUID = "a".repeat(40) + "B-_9".repeat(9) + "zz";

describe("problem log scrubbing", () => {
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

});

describe("logProblem", () => {
  it("writes the scrubbed message to the local log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logProblem("Server config rejected for Me#EUW");
    expect(warn).toHaveBeenCalledWith("Server config rejected for <riot-id>");
    warn.mockRestore();
  });
});
