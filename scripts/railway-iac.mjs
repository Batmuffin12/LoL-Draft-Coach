// Runs `railway config <plan|apply|pull> ...` for the Railway IaC in .railway/railway.ts.
//
// Why a wrapper: the railway/iac SDK re-runs the CLI to check its version, using the "_"
// environment variable or "railway" on PATH. When the CLI was installed with npm on Windows,
// "railway" is a .cmd shim that Node can't execute, so the check fails. This points "_" at
// the real railway executable first.
import { spawnSync } from "node:child_process";
import { railwayExecutable, railwaySpawnOptions } from "./railway-cli.mjs";

const exe = railwayExecutable();
const result = spawnSync(exe, ["config", ...process.argv.slice(2)], railwaySpawnOptions(exe, { stdio: "inherit", env: { ...process.env, _: exe } }));
process.exit(result.status ?? 1);
