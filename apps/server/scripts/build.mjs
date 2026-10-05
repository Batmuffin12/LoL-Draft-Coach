// Bundles the server (and the workspace packages it uses) into one ESM file for Node 22.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
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
});
