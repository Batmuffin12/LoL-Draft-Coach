import { createHash, randomBytes } from "node:crypto";

/** Bearer tokens: 32 random bytes, prefixed so a leaked one is recognisable. */
export function newToken(): string {
  return `ldc_${randomBytes(32).toString("base64url")}`;
}

/** Crockford-style alphabet: no I, L, O, U, so codes survive being read aloud or retyped. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Invite codes: 12 characters (60 bits) in groups of four, e.g. "7KQ2-M9XD-4TRB". */
export function newInviteCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]!).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Codes are compared case-insensitively and without separators or spaces. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Only hashes of tokens and invite codes are stored. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Reads `Authorization: Bearer <token>`; null when absent or malformed. */
export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1]! : null;
}
