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
let misses = 0;

async function stop(): Promise<void> {
  const file = await recorder.save(outDir, "Recorded live game (anonymised)");
  console.log(file ? `Saved ${recorder.frameCount} snapshots: ${file}` : "Nothing recorded.");
  process.exit(0);
}

console.log(`Waiting for a game (a snapshot every ${every} s). Press Ctrl+C to stop and save.`);
process.on("SIGINT", () => void stop());
for (;;) {
  const raw = await client.allGameData();
  if (raw && recorder.add(raw)) {
    if (recorder.frameCount === 1) console.log("Game found: recording.");
    misses = 0;
  } else if (recorder.frameCount > 0 && ++misses >= 3) {
    console.log("The game ended.");
    await stop();
  }
  await new Promise((r) => setTimeout(r, every * 1000));
}
