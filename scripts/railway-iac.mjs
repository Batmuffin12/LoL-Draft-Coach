// Runs `railway config <plan|apply|pull> ...` for the Railway IaC in .railway/railway.ts.
//
// Why a wrapper: the railway/iac SDK re-runs the CLI to check its version, using the "_"
// environment variable or "railway" on PATH. When the CLI was installed with npm on Windows,
// "railway" is a .cmd shim that Node can't execute, so the check fails. This points "_" at
// the real railway executable first.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function railwayExecutable() {
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = join(process.env.APPDATA, "npm", "node_modules", "@railway", "cli", "bin", "railway.exe");
    if (existsSync(exe)) return exe;
  }
  return "railway";
}

const exe = railwayExecutable();
const result = spawnSync(exe, ["config", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, _: exe },
  shell: exe === "railway" && process.platform === "win32",
});
process.exit(result.status ?? 1);
