import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

// Excluded: the LDC_PERF dev aid (src/main/perf.ts, src/renderer/perf.ts), development builds only, driven by `pnpm perf`.
// Separate from vite.config.ts, whose root is the renderer folder.
export default defineConfig({
  test: { root: ".", include: ["test/**/*.test.ts"], environment: "node", coverage: coverage(undefined, ["src/main/perf.ts", "src/renderer/perf.ts"]) },
});
