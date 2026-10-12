// Windows installer for friends. Build with: pnpm --filter @ldc/desktop dist:win (never publishes);
// publish a release with: pnpm --filter @ldc/desktop release (docs/DEPLOY.md).
// Updates come from this public repo's GitHub Releases: installed apps read releases
// anonymously, so no token ships in the app. LDC_UPDATE_URL (build time) points them at
// another public location instead (generic provider, e.g. a Cloudflare R2 bucket).
const updateUrl = process.env.LDC_UPDATE_URL;
/** Uploaded as a draft: installed apps only see it once the owner publishes it on GitHub. */
const githubReleases = { provider: "github", owner: "Batmuffin12", repo: "LoL-Draft-Coach", releaseType: "draft" };
// The coach server address friends connect to, prefilled in the app (they only paste an invite code).
const serverUrl = process.env.LDC_SERVER_URL;
// Crash reports (Sentry project DSN; not a secret): off in installers built without it.
const sentryDsn = process.env.LDC_SENTRY_DSN;

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "dev.ldc.draftcoach",
  productName: "LoL Draft Coach",
  directories: { output: "release" },
  // Main, preload and renderer are bundled into dist/; only native addons ship as node_modules.
  files: ["dist/**", "package.json"],
  // Join links from the invite page (lol-draft-coach://join/CODE) open the app with the code filled in.
  protocols: [{ name: "LoL Draft Coach invite", schemes: ["lol-draft-coach"] }],
  extraResources: [{ from: "../../config", to: "config", filter: ["*.json"] }],
  asarUnpack: ["**/node_modules/koffi/**"],
  npmRebuild: false,
  extraMetadata: { ...(serverUrl ? { ldcDefaultServerUrl: serverUrl } : {}), ...(sentryDsn ? { ldcSentryDsn: sentryDsn } : {}) },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "LoL-Draft-Coach-Setup-${version}.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: "LoL Draft Coach",
  },
  publish: [updateUrl ? { provider: "generic", url: updateUrl } : githubReleases],
};
