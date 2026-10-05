// Bundles the server, the invite and collect commands (with the workspace packages they use) into ESM files for Node 22.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  // Native addon: installed with the app, loaded at runtime.
  external: ["better-sqlite3"],
  // Lets bundled CommonJS dependencies call require() inside the ESM bundle.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};

await Promise.all([
  build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.js" }),
  build({ ...common, entryPoints: ["src/invite-cli.ts"], outfile: "dist/invite.js" }),
  build({ ...common, entryPoints: ["src/collect-cli.ts"], outfile: "dist/collect.js" }),
]);
