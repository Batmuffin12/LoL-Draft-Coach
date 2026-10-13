/**
 * Why a release can't be published now (empty: it can). Pure, so it's tested.
 * - The first GitHub Release is v1.0.0: installed apps treat any published release as an update.
 * - Only a committed, tagged state is released, so the installer matches the tag.
 * @param {{ version: string; dirty: boolean; tags: string[]; token: boolean }} s
 * @returns {string[]}
 */
export function releaseProblems(s) {
  const problems = [];
  const major = Number(/^(\d+)\.\d+\.\d+$/.exec(s.version)?.[1] ?? NaN);
  if (!Number.isInteger(major)) problems.push(`"${s.version}" isn't a plain x.y.z version.`);
  else if (major < 1) problems.push(`Version ${s.version}: nothing is published before v1.0.0 (installed apps would take it as an update).`);
  if (s.dirty) problems.push("The working tree has uncommitted changes: commit them first.");
  if (!s.tags.includes(`v${s.version}`)) problems.push(`HEAD isn't tagged v${s.version}: merge, tag and push the tag first.`);
  if (!s.token) problems.push("No GitHub token: run `gh auth login` (the token is used only to upload, never built into the app).");
  return problems;
}

/**
 * The CHANGELOG.md section of a version (without its heading), for the release notes;
 * empty when the changelog has none. Pure, so it's tested.
 * @param {string} changelog
 * @param {string} version
 * @returns {string}
 */
export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}
