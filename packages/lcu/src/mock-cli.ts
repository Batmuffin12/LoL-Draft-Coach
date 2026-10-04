/**
 * Runs a mock League client that replays a fixture in a loop, for trying the panel
 * without League. Usage: pnpm --filter @ldc/lcu mock [fixture-name] [time-scale]
 * then start the desktop app with the printed LDC_LCU_OVERRIDE value.
 */
import { loadFixture, MockLcuServer } from "./testing";

const name = process.argv[2] ?? "synthetic-draft-pick";
const timeScale = Number(process.argv[3] ?? "0.15");
const server = new MockLcuServer(loadFixture(name), {
  "/lol-summoner/v1/current-summoner": { puuid: "mock-local-player", gameName: "Mock", tagLine: "MOCK" },
});
const creds = await server.start();
console.log(`Mock League client replaying "${name}".`);
console.log(`Start the panel with:  $env:LDC_LCU_OVERRIDE="${creds.port}:${creds.password}"; pnpm desktop`);

for (;;) {
  while (server.clientCount === 0) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 2_000));
  await server.playAll(timeScale);
  console.log("Draft finished; replaying in 5s.");
  await new Promise((r) => setTimeout(r, 5_000));
  server.reset();
  server.push("/lol-gameflow/v1/gameflow-phase", "ChampSelect");
  server.push("/lol-champ-select/v1/session", loadFixture(name).snapshots["/lol-champ-select/v1/session"]);
}
