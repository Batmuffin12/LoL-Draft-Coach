// Windows installer for friends. Build with: pnpm --filter @ldc/desktop dist:win
// Auto-update needs a PUBLIC place for releases (the repo is private, and a token must
// never ship in the app). Set LDC_UPDATE_URL at build time, e.g. the latest-release
// download URL of a public releases-only repo, or a Cloudflare R2 bucket.
const updateUrl = process.env.LDC_UPDATE_URL;
// The coach server address friends connect to, prefilled in the app (they only paste an invite code).
const serverUrl = process.env.LDC_SERVER_URL;

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "dev.ldc.draftcoach",
  productName: "LoL Draft Coach",
  directories: { output: "release" },
  // Main, preload and renderer are bundled into dist/; only native addons ship as node_modules.
  files: ["dist/**", "package.json"],
  extraResources: [{ from: "../../config", to: "config", filter: ["*.json"] }],
  asarUnpack: ["**/node_modules/koffi/**"],
  npmRebuild: false,
  extraMetadata: serverUrl ? { ldcDefaultServerUrl: serverUrl } : {},
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
  ...(updateUrl ? { publish: [{ provider: "generic", url: updateUrl }] } : { publish: null }),
};
