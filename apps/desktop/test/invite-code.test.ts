import { describe, expect, it } from "vitest";
import { codeLength, joinCode, splitCode } from "../src/renderer/components/InviteCodeInput";
import { setCopy, t } from "../src/renderer/format";

describe("invite code boxes", () => {
  it("splits a pasted code with or without dashes or spaces, upper case", () => {
    expect(splitCode("abcd-efgh-ijkl")).toEqual(["ABCD", "EFGH", "IJKL"]);
    expect(splitCode("ABCD EFGH IJKL")).toEqual(["ABCD", "EFGH", "IJKL"]);
    expect(splitCode("abcdefghijklmnop")).toEqual(["ABCD", "EFGH", "IJKL"]);
    expect(splitCode("ab")).toEqual(["AB", "", ""]);
  });

  it("joins the boxes for the server, keeping a box's place", () => {
    expect(joinCode(["ABCD", "EFGH", "IJKL"])).toBe("ABCD-EFGH-IJKL");
    expect(joinCode(["ABCD", "", ""])).toBe("ABCD");
    expect(joinCode(["", "EF", ""])).toBe("-EF");
    expect(codeLength("ABCD-EFGH-IJKL")).toBe(12);
  });
});

describe("panel wording", () => {
  it("fills slots and plurals, and shows the key when the config lacks it", () => {
    setCopy({ "a": "{n} {n|game|games} on {name}" });
    expect(t("a", { n: 1, name: "Ahri" })).toBe("1 game on Ahri");
    expect(t("a", { n: 3, name: "Ahri" })).toBe("3 games on Ahri");
    expect(t("missing.key")).toBe("missing.key");
  });
});
