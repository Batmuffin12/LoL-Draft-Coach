import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

export default defineConfig({
  test: { coverage: coverage({ lines: 98, branches: 79 }) },
});
