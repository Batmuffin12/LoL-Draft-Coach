import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("purity", () => {
  it("meta source has no network or filesystem imports", () => {
    const dir = join(__dirname, "..", "src");
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/from "node:|require\(|\bfetch\(|from "(fs|http|https|net)"/);
    }
  });
});
