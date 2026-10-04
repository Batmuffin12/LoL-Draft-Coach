/**
 * Records real champ selects into anonymised fixtures.
 * Usage: pnpm --filter @ldc/lcu record   (start the League client, then enter champ select)
 */
import { join } from "node:path";
import { discoverCredentials, LcuConnector, FixtureRecorder } from "./index";
import { FIXTURES_DIR } from "./load-fixture";

const installDir = process.env.LOL_INSTALL_DIR ?? "C:\Riot Games\League of Legends";
const outDir = join(FIXTURES_DIR, "recorded");

const connector = new LcuConnector({ discover: () => discoverCredentials({ installDir }) });
new FixtureRecorder(connector, outDir, (file) => console.log(`Saved anonymised fixture: ${file}`));
connector.on("status", (s) => console.log(`League client: ${s}`));
connector.on("gameflowPhase", (p) => console.log(`Gameflow phase: ${p}`));
connector.on("schemaError", (e) => console.error(e.message));
connector.start();
console.log("Recording champ selects. Press Ctrl+C to stop.");
process.on("SIGINT", () => {
  connector.stop();
  process.exit(0);
});
