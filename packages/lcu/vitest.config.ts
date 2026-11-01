import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

// Excluded: the `mock` and `record` developer command lines (argument handling; what they drive is tested).
export default defineConfig({
  test: { coverage: coverage(undefined, ["src/mock-cli.ts","src/record-cli.ts"]) },
});
