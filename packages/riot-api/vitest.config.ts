import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

export default defineConfig({
  test: { coverage: coverage({ lines: 97, branches: 81 }) },
});
