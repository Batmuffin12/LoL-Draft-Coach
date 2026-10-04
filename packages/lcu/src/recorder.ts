import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LcuConnector } from "./connector";
import { LCU_PATHS } from "./connector";
import { anonymizeFixture, findIdentifiers, type Fixture } from "./fixture";

/** Endpoints captured as snapshots when a champ select starts. */
export const SNAPSHOT_PATHS = [
  LCU_PATHS.gameflowPhase,
  LCU_PATHS.gameflowSession,
  LCU_PATHS.champSelectSession,
  LCU_PATHS.pickableChampionIds,
  LCU_PATHS.recommendedPositions,
] as const;

/**
 * Records each champ select (start to end) into an anonymised fixture file.
 * Nothing un-anonymised is ever written to disk.
 */
export class FixtureRecorder {
  private current: { startedAt: number; fixture: Fixture } | null = null;

  constructor(
    private readonly connector: LcuConnector,
    private readonly outDir: string,
    private readonly onSaved: (path: string) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {
    connector.on("rawEvent", (e) => {
      if (!this.current) return;
      this.current.fixture.frames.push({ t: this.now() - this.current.startedAt, ...e });
    });
    connector.on("gameflowPhase", (phase) => {
      if (phase === "ChampSelect" && !this.current) void this.begin();
      else if (phase !== "ChampSelect" && this.current) void this.finish();
    });
  }

  private async begin(): Promise<void> {
    const startedAt = this.now();
    const snapshots: Record<string, unknown> = {};
    for (const path of SNAPSHOT_PATHS) snapshots[path] = await this.connector.getRaw(path).catch(() => null);
    this.current = {
      startedAt,
      fixture: { format: 1, description: "", recordedAt: new Date(startedAt).toISOString(), snapshots, frames: [] },
    };
  }

  /** Writes the current recording; returns the file path (or null if nothing was recording). */
  async finish(): Promise<string | null> {
    const rec = this.current;
    this.current = null;
    if (!rec) return null;
    const clean = anonymizeFixture(rec.fixture);
    const leftovers = findIdentifiers(clean);
    if (leftovers.length) throw new Error(`Refusing to write fixture with identifiers: ${leftovers.join(", ")}`);
    await mkdir(this.outDir, { recursive: true });
    const file = join(this.outDir, `champ-select-${rec.fixture.recordedAt.replace(/[:.]/g, "-")}.json`);
    await writeFile(file, JSON.stringify(clean, null, 2) + "\n", "utf8");
    this.onSaved(file);
    return file;
  }
}
