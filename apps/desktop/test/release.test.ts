import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { releaseProblems } from "../scripts/release-check.mjs";

const ok = { version: "1.0.0", dirty: false, tags: ["v1.0.0"], token: true };
const check = releaseProblems as (s: typeof ok) => string[];

describe("releaseProblems", () => {
  it("releases a committed, tagged 1.x with a token", () => {
    expect(check(ok)).toEqual([]);
    expect(check({ ...ok, version: "1.2.3", tags: ["v1.2.3"] })).toEqual([]);
  });

  it("never releases before v1.0.0", () => {
    expect(check({ ...ok, version: "0.9.0", tags: ["v0.9.0"] })).toEqual([expect.stringMatching(/nothing is published before v1\.0\.0/)]);
    expect(check({ ...ok, version: "1.0.0-beta.1", tags: ["v1.0.0-beta.1"] })).toEqual([expect.stringMatching(/isn't a plain x\.y\.z/)]);
  });

  it("needs a clean tree, the version's tag on HEAD and a token", () => {
    expect(check({ ...ok, dirty: true, tags: ["v0.9.9"], token: false })).toEqual([
      expect.stringMatching(/uncommitted/),
      expect.stringMatching(/isn't tagged v1\.0\.0/),
      expect.stringMatching(/No GitHub token/),
    ]);
  });
});

describe("installer config", () => {
  const load = (env: Record<string, string | undefined>) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    try {
      const require = createRequire(import.meta.url);
      const path = require.resolve("../electron-builder.config.cjs");
      delete require.cache[path];
      return require(path) as { publish: Record<string, unknown>[] };
    } finally {
      process.env = saved;
    }
  };

  it("updates from this repo's GitHub Releases, as drafts the owner publishes", () => {
    expect(load({ LDC_UPDATE_URL: undefined }).publish).toEqual([{ provider: "github", owner: "Batmuffin12", repo: "LoL-Draft-Coach", releaseType: "draft" }]);
  });

  it("points at another public location when LDC_UPDATE_URL is set", () => {
    expect(load({ LDC_UPDATE_URL: "https://updates.example" }).publish).toEqual([{ provider: "generic", url: "https://updates.example" }]);
  });
});
