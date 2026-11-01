import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

// Excluded: the `mock` developer command line (argument handling; what it drives is tested).
export default defineConfig({
  test: { coverage: coverage(undefined, ["src/mock-cli.ts"]) },
});
