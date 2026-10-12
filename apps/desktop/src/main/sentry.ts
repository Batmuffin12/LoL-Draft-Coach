// Bundled on its own (dist/main/sentry.cjs) and loaded only when crash reports start, so the
// SDK costs nothing at startup (scripts/build-main.mjs, crash-reports.ts).
export { captureException, captureMessage, init } from "@sentry/electron/main";
