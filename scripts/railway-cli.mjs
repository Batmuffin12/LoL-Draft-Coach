// Finds the Railway CLI executable. On Windows an npm-installed CLI is a .cmd shim that
// Node can't execute directly; the real railway.exe lives inside the npm package.
import { existsSync } from "node:fs";
import { join } from "node:path";

export function railwayExecutable() {
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = join(process.env.APPDATA, "npm", "node_modules", "@railway", "cli", "bin", "railway.exe");
    if (existsSync(exe)) return exe;
  }
  return "railway";
}

/** spawnSync options that work for both the real executable and a PATH lookup. */
export function railwaySpawnOptions(exe, extra = {}) {
  return { shell: exe === "railway" && process.platform === "win32", ...extra };
}
