import { describe, expect, it } from "vitest";
import { inviteFromArgs } from "../src/main/join-link";

describe("inviteFromArgs", () => {
  const exe = "C:\Program Files\LoL Draft Coach\LoL Draft Coach.exe";

  it("finds the code in a join link among the arguments, in any spelling", () => {
    expect(inviteFromArgs([exe, "lol-draft-coach://join/HJ0S-XYFW-G0C6"])).toBe("HJ0S-XYFW-G0C6");
    expect(inviteFromArgs([exe, "--flag", "lol-draft-coach://join/hj0sxyfwg0c6/"])).toBe("HJ0S-XYFW-G0C6");
    expect(inviteFromArgs([exe, "LOL-DRAFT-COACH://join/HJ0S%20XYFW%20G0C6"])).toBe("HJ0S-XYFW-G0C6");
    expect(inviteFromArgs([exe, "lol-draft-coach://open?code=HJ0S-XYFW-G0C6"])).toBe("HJ0S-XYFW-G0C6");
  });

  it("ignores anything that isn't a whole code in our link", () => {
    expect(inviteFromArgs([exe])).toBeNull();
    expect(inviteFromArgs([exe, "https://example.com/join/HJ0S-XYFW-G0C6"])).toBeNull();
    expect(inviteFromArgs([exe, "lol-draft-coach://join/HJ0S-XYFW"])).toBeNull();
    expect(inviteFromArgs([exe, "lol-draft-coach://join/HJ0S-XYFW-G0C6<script>"])).toBeNull();
    expect(inviteFromArgs([exe, "lol-draft-coach://%%%"])).toBeNull();
  });
});
