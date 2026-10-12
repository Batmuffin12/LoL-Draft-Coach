// Builds the Windows installer and uploads it to this repo's GitHub Releases as a draft
// (docs/DEPLOY.md). Installed apps see it only after you publish the draft on GitHub.
//   pnpm --filter @ldc/desktop release
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { releaseProblems } from "./release-check.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
let token = process.env.GH_TOKEN ?? "";
if (!token) {
  try {
    token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    // Reported below.
  }
}
const problems = releaseProblems({ version, dirty: git("status", "--porcelain") !== "", tags: git("tag", "--points-at", "HEAD").split(/\s+/), token: token !== "" });
if (problems.length) {
  console.error(`Not releasing v${version}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
if (process.env.LDC_UPDATE_URL) {
  console.error("LDC_UPDATE_URL is set: this release would point installed apps elsewhere. Unset it to release on GitHub.");
  process.exit(1);
}
const run = (cmd) => {
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env: { ...process.env, GH_TOKEN: token } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("pnpm build");
run("electron-builder --win nsis --config electron-builder.config.cjs --publish always");
console.log(`Uploaded v${version} as a draft release. Check it on GitHub, then publish it: installed apps update from then on.`);
