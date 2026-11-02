import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

// Excluded: the LDC_PERF dev aid (src/main/perf.ts, src/renderer/perf.ts), development builds only, driven by `pnpm perf`.
// Separate from vite.config.ts, whose root is the renderer folder.
export default defineConfig({
  // A long limit for a hang, not a speed check: on a busy machine (16 cores all taken) the mock client's TLS handshakes and
  // real timers take seconds, and the default 5 s fails tests that are only slow. Conditions wait in `waitFor` (helpers.ts).
  test: { root: ".", include: ["test/**/*.test.ts"], environment: "node", testTimeout: 30_000, coverage: coverage({ lines: 87, branches: 75 }, ["src/main/perf.ts", "src/renderer/perf.ts"]) },
});
