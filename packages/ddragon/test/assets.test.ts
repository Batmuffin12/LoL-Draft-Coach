import { describe, expect, it } from "vitest";
import { COMMUNITY_DRAGON_STATIC_ASSETS, positionIconUrl } from "../src/assets";

describe("positionIconUrl", () => {
  it("is CommunityDragon's copy of the client's icon for the position", () => {
    expect(positionIconUrl("middle")).toBe(`${COMMUNITY_DRAGON_STATIC_ASSETS}svg/position-middle.svg`);
  });

  it("takes any id the game's data gives, in lower case and safe in a URL", () => {
    expect(positionIconUrl("UTILITY", "https://x/")).toBe("https://x/svg/position-utility.svg");
    expect(positionIconUrl("a b", "https://x/")).toBe("https://x/svg/position-a%20b.svg");
  });
});
