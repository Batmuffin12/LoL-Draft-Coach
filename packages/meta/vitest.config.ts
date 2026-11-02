import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

export default defineConfig({
  test: { coverage: coverage({ lines: 96, branches: 79 }) },
});
