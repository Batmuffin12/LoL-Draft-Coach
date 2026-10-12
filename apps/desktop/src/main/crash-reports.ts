import { join } from "node:path";

/**
 * Crash reports (Sentry), only in installers built with LDC_SENTRY_DSN. Nothing that
 * identifies a player leaves the PC: every string in an event is scrubbed of Riot IDs,
 * PUUIDs, app tokens, Riot keys and the Windows user name in paths, and the user,
 * host name and request headers are dropped.
 */

const RULES: [RegExp, string][] = [
  // C:\Users\<name>\… and C:/Users/<name>/… (also escaped backslashes in JSON text)
  // (user names may hold spaces: everything up to the next separator goes).
  [/([A-Za-z]:(?:\\\\|\\|\/)+Users(?:\\\\|\\|\/)+)[^\\/"'\r\n]+/gi, "$1<user>"],
  [/RGAPI-[0-9a-f-]{36}/gi, "<riot-key>"],
  [/\bldc_[A-Za-z0-9_-]+/g, "<token>"],
  // PUUIDs: 78 characters of base64url.
  [/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{78}(?![A-Za-z0-9_-])/g, "<puuid>"],
  // Riot IDs: name#tag (the name may hold spaces, so take the word before #).
  [/[^\s#"'<>()[\]{}:,;=/\\]{2,16}#[A-Za-z0-9]{2,5}\b/g, "<riot-id>"],
];

/** A string without player identifiers or the Windows user name. Pure. */
export function scrubText(s: string): string {
  return RULES.reduce((t, [re, to]) => t.replace(re, to), s);
}

/** Scrubs every string in a value, depth first; drops keys that identify the user or the PC. Pure. */
export function scrubValue<T>(v: T, depth = 0): T {
  if (typeof v === "string") return scrubText(v) as T;
  if (!v || typeof v !== "object" || depth > 12) return v;
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (DROPPED.has(k)) continue;
    out[scrubText(k)] = scrubValue(x, depth + 1);
  }
  return out as T;
}
const DROPPED = new Set(["user", "server_name", "headers", "cookies", "ip_address"]);

type Sentry = typeof import("./sentry");
let sentry: Sentry | null = null;

/**
 * Starts crash reports (before Electron's "ready", as the SDK requires). The SDK is its own file
 * next to the main bundle (dist/main/sentry.cjs, ~60 ms to load and start), so builds without a
 * DSN never parse it.
 */
export function startCrashReports(dsn: string, release: string, load: () => Sentry = () => require(join(__dirname, "sentry.cjs")) as Sentry): void {
  const s = load();
  s.init({
    dsn,
    release,
    sendDefaultPii: false,
    beforeSend: (event) => scrubValue(event),
    beforeBreadcrumb: (crumb) => scrubValue(crumb),
  });
  sentry = s;
}

/** Reports an error that was caught (the SDK reports uncaught ones itself). */
export function reportError(err: Error): void {
  sentry?.captureException(err);
}

/** Reports something that went wrong without crashing (e.g. a server config this app rejects). */
export function reportProblem(message: string): void {
  sentry?.captureMessage(scrubText(message), "warning");
}
