/**
 * The technical detail of a problem the player sees in plain words. It goes to the local log only:
 * nothing leaves the PC. Riot IDs, PUUIDs, match IDs, app tokens, Riot keys and the Windows user
 * name are scrubbed first, because people paste logs.
 */

const RULES: [RegExp, string][] = [
  // C:\Users\<name>\… and C:/Users/<name>/… (also escaped backslashes in JSON text)
  // (user names may hold spaces: everything up to the next separator goes).
  [/([A-Za-z]:(?:\\\\|\\|\/)+Users(?:\\\\|\\|\/)+)[^\\/"'\r\n]+/gi, "$1<user>"],
  [/RGAPI-[0-9a-f-]{36}/gi, "<riot-key>"],
  [/\bldc_[A-Za-z0-9_-]+/g, "<token>"],
  // PUUIDs: 78 characters of base64url.
  [/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{78}(?![A-Za-z0-9_-])/g, "<puuid>"],
  // Match IDs (EUW1_7123456789): anyone can look up who played in a game. No \b in front,
  // so IDs in an encoded list (%2CEUW1_…) go too.
  [/(?:[A-Z]{2,3}\d|KR|RU)_\d{6,}\b/g, "<match>"],
  // Riot IDs: name#tag (the name may hold spaces, so take the word before #).
  [/[^\s#"'<>()[\]{}:,;=/\\]{2,16}#[A-Za-z0-9]{2,5}\b/g, "<riot-id>"],
];

/** A string without player identifiers or the Windows user name. Pure. */
export function scrubText(s: string): string {
  return RULES.reduce((t, [re, to]) => t.replace(re, to), s);
}

/** Logs something that went wrong without crashing (e.g. a server config this app rejects). */
export function logProblem(message: string): void {
  console.warn(scrubText(message));
}
