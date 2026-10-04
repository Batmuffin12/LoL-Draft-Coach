import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureSchema, type Fixture } from "./fixture";

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** Loads and validates a fixture from packages/lcu/fixtures (name without .json). */
export function loadFixture(name: string): Fixture {
  return FixtureSchema.parse(JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8")));
}
