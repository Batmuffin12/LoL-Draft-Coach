import { defineConfig } from "vitest/config";
import { coverage } from "../../vitest.coverage.ts";

// Excluded: the developer command lines src/*-cli.ts (scorecard, backtest, spikes, collect, backup, invite):
// argument handling and printing around logic tested on its own (packages/meta, backup.ts, collector.ts, accounts.ts).
export default defineConfig({
  test: { coverage: coverage({ lines: 93, branches: 86 }, ["src/*-cli.ts"]) },
});
