import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LiveGame } from "@ldc/shared";
import { identityKeys, type LiveFixture } from "./fixture";
import { leakPaths, playerNames, sanitizeLiveGame } from "./sanitize";

/**
 * Records a live game into an anonymised fixture: each raw snapshot is sanitized at once, and
 * only sanitized data is kept in memory or written. Before writing, the file is checked for
 * every player name seen during the game and for identity keys; it refuses to write otherwise.
 */
export class LiveRecorder {
  private frames: LiveFixture["frames"] = [];
  private events: LiveGame["events"] = [];
  private names = new Set<string>();
  private startedAt: number | null = null;

  constructor(
    private readonly everySeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Adds one raw `allgamedata` response; returns false when it isn't a game. */
  add(raw: unknown): boolean {
    const game = sanitizeLiveGame(raw);
    if (!game) return false;
    for (const n of playerNames(raw)) this.names.add(n);
    const now = this.now();
    this.startedAt ??= now;
    const { events, ...rest } = game;
    this.frames.push({ t: (now - this.startedAt) / 1000, game: rest });
    this.events = events;
    return true;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** The fixture without the leak checks: only for the gitignored local folder. */
  private unchecked(description: string): LiveFixture {
    return { format: 1, description, recordedAt: new Date(this.startedAt ?? this.now()).toISOString(), everySeconds: this.everySeconds, frames: this.frames, events: this.events };
  }

  /** The fixture, after the leak checks (throws when a name or identity key is left; the message holds paths, never names). */
  fixture(description = ""): LiveFixture {
    const f = this.unchecked(description);
    const leaks = [...new Set(leakPaths(f, [...this.names]).map((p) => p.replace(/\[\d+\]/g, "[]")))];
    if (leaks.length) throw new Error(`Refusing to write: a player name may be left at ${leaks.slice(0, 5).join(", ")}`);
    const keys = identityKeys(f);
    if (keys.length) throw new Error(`Refusing to write: identity keys left (${keys.slice(0, 3).join(", ")})`);
    return f;
  }

  /** Writes the checked fixture to `dir`; returns the file path, or null when nothing was recorded. */
  async save(dir: string, description = ""): Promise<string | null> {
    if (!this.frames.length) return null;
    return write(dir, this.fixture(description));
  }

  /**
   * Writes the sanitized recording to a gitignored local folder without the leak checks: a
   * checkpoint during the game, and the fallback when `save` refuses, so a game is never lost.
   */
  async saveLocal(dir: string, description = ""): Promise<string | null> {
    if (!this.frames.length) return null;
    return write(dir, this.unchecked(description));
  }
}

async function write(dir: string, f: LiveFixture): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, `live-game-${f.recordedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify(f) + "\n", "utf8");
  return file;
}
