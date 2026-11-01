// Coverage settings shared by every package's vitest.config.ts. Nothing here runs
// on `pnpm test`: v8 only instruments under `pnpm coverage` (vitest run --coverage).

export type Floor = { lines: number; branches: number };

/**
 * Only what truly isn't app logic is left out, and each exclusion is listed:
 * - dist, node_modules, coverage: build outputs (and outside `src/` anyway).
 * - test files and fixtures: not the code under test.
 * - `*.d.ts`: types only, no code runs.
 * A package adds its own (developer CLI entry points and the like) in its config.
 * packages/jev is frozen behind JEV_ENABLED=false, so `pnpm coverage` skips it.
 */
export function coverage(floor?: Floor, exclude: string[] = []) {
  return {
    provider: "v8" as const,
    reporter: ["text-summary", "json-summary"],
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.test.*", "**/fixtures/**", "**/*.d.ts", ...exclude],
    ...(floor ? { thresholds: floor } : {}),
  };
}
