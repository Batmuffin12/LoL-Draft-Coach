/**
 * Records a live game into an anonymised fixture (milestone 10, A15: are enemy items live or last seen?).
 *   pnpm --filter @ldc/live-client record              start it, then play a game; it saves when the game ends
 *   pnpm --filter @ldc/live-client record --every 5    seconds between snapshots (default 10)
 * Only sanitized snapshots are kept: no summoner names or Riot IDs are ever written.
 */
import { join } from "node:path";
import { FIXTURES_DIR } from "./fixture";
import { LiveClientHttp } from "./client";
import { LiveRecorder } from "./recorder";

const args = process.argv.slice(2);
const i = args.indexOf("--every");
const every = i >= 0 ? Number(args[i + 1]) : 10;
const client = new LiveClientHttp();
const recorder = new LiveRecorder(every);
const outDir = join(FIXTURES_DIR, "recorded");
/** Gitignored: the checkpoint during a game, and where a recording goes when the leak check refuses it. */
const localDir = join(FIXTURES_DIR, "raw");
const DESCRIPTION = "Recorded live game (anonymised)";
let misses = 0;

async function stop(): Promise<void> {
  try {
    const file = await recorder.save(outDir, DESCRIPTION);
    console.log(file ? `Saved ${recorder.frameCount} snapshots: ${file}` : "Nothing recorded.");
  } catch (e) {
    const file = await recorder.saveLocal(localDir, DESCRIPTION);
    console.log(`${(e as Error).message}.\nKept it in the local-only folder instead (not committed): ${file}`);
  }
  process.exit(0);
}

console.log(`Waiting for a game (a snapshot every ${every} s). Press Ctrl+C to stop and save.`);
process.on("SIGINT", () => void stop());
for (;;) {
  const raw = await client.allGameData();
  if (raw && recorder.add(raw)) {
    if (recorder.frameCount === 1) console.log("Game found: recording.");
    // A checkpoint every ~5 minutes, so a crash never loses the game.
    if (recorder.frameCount % Math.max(1, Math.round(300 / every)) === 0) await recorder.saveLocal(localDir, DESCRIPTION);
    misses = 0;
  } else if (recorder.frameCount > 0 && ++misses >= 3) {
    console.log("The game ended.");
    await stop();
  }
  await new Promise((r) => setTimeout(r, every * 1000));
}
