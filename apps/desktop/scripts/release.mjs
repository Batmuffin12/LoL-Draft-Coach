// Builds the Windows installer and uploads it to this repo's GitHub Releases as a draft
// (docs/DEPLOY.md). Installed apps see it only after you publish the draft on GitHub.
//   pnpm --filter @ldc/desktop release
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { releaseNotes, releaseProblems } from "./release-check.mjs";

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
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } }).trim();
const tag = `v${version}`;
const releasesOfTag = () => JSON.parse(gh("api", "repos/{owner}/{repo}/releases?per_page=30")).filter((r) => r.tag_name === tag);
if (releasesOfTag().length) {
  console.error(`A release for ${tag} already exists on GitHub (draft or published): delete the draft or bump the version first.`);
  process.exit(1);
}
run("pnpm build");
// Create the draft first: electron-builder uploads its three files in parallel and, with no
// release for the tag yet, each upload created its own draft (v1.0.0 got two).
const notes = releaseNotes(readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8"), version);
gh("release", "create", tag, "--draft", "--verify-tag", "--title", tag, "--notes", notes || `LoL Draft Coach ${tag}`);
run("electron-builder --win nsis --config electron-builder.config.cjs --publish always");
const drafts = releasesOfTag();
const files = drafts.flatMap((r) => r.assets.map((a) => a.name));
const expected = [`LoL-Draft-Coach-Setup-${version}.exe`, `LoL-Draft-Coach-Setup-${version}.exe.blockmap`, "latest.yml"];
if (drafts.length !== 1 || !expected.every((f) => files.includes(f))) {
  console.error(`Expected one draft for ${tag} with ${expected.join(", ")}; found ${drafts.length} release(s) with ${files.join(", ") || "no files"}. Fix it on GitHub before publishing.`);
  process.exit(1);
}
console.log(`Uploaded ${tag} as a draft release with its notes from CHANGELOG.md. Check it on GitHub, then publish it: installed apps update from then on.`);
