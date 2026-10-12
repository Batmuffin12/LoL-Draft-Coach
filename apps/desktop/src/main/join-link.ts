/**
 * Invite links: the join page (site/join.html) opens lol-draft-coach://join/ABCD-EFGH-IJKL, Windows
 * starts the app with that link as an argument (the installer registers the scheme), and the
 * connect screen arrives with the code filled in. The player still clicks Connect.
 */
export const JOIN_SCHEME = "lol-draft-coach";

/** The invite code in a join link among the process arguments ("ABCD-EFGH-IJKL"), or null. Pure. */
export function inviteFromArgs(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (!arg.toLowerCase().startsWith(`${JOIN_SCHEME}:`)) continue;
    let url: URL;
    try {
      url = new URL(arg);
    } catch {
      continue;
    }
    // lol-draft-coach://join/CODE (host "join"), or ?code=CODE as a fallback.
    const raw = url.hostname === "join" ? decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")) : (url.searchParams.get("code") ?? "");
    const chars = raw.replace(/[\s-]/g, "").toUpperCase();
    if (/^[A-Z0-9]{12}$/.test(chars)) return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
  }
  return null;
}
