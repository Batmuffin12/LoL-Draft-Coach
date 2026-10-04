// Bundles the Electron main and preload scripts (and the workspace packages they use) to CJS.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  // electron is provided at runtime; koffi ships a native addon; ws' optional native helpers.
  external: ["electron", "koffi", "bufferutil", "utf-8-validate"],
};

await Promise.all([
  build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main/index.cjs" }),
  build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist/preload/index.cjs" }),
]);
