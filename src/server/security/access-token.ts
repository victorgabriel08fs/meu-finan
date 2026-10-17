// Tokens of the one-time access links (invites and resets, doc 01 §11.9). No
// I/O, so they are unit-tested.
//
// Split token: the link carries `<selector>.<verifier>`. The selector (12
// random bytes) is a lookup key stored as is; the verifier (32 random bytes)
// is the secret, and only its SHA-256 is stored. A lookup never runs on a
// secret-derived value, and the verifier is compared in constant time.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** How long a link works: 72 hours. */
export const ACCESS_LINK_TTL_MS = 72 * 60 * 60 * 1000;

const SELECTOR_BYTES = 12;
const VERIFIER_BYTES = 32;
/** base64url of 12 and 32 bytes, without padding: 16 and 43 characters. */
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/;

export type NewAccessToken = {
  /** Goes into the URL once and is never stored. */
  token: string;
  selector: string;
  verifierHash: string;
};

export function hashVerifier(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("hex");
}

export function createAccessToken(): NewAccessToken {
  const selector = randomBytes(SELECTOR_BYTES).toString("base64url");
  const verifier = randomBytes(VERIFIER_BYTES).toString("base64url");
  return {
    token: `${selector}.${verifier}`,
    selector,
    verifierHash: hashVerifier(verifier),
  };
}

/** The two halves of a token from a URL, or null when it is not well formed. */
export function parseAccessToken(
  token: string | null | undefined,
): { selector: string; verifier: string } | null {
  const match = token ? TOKEN_PATTERN.exec(token) : null;
  if (!match?.[1] || !match[2]) return null;
  return { selector: match[1], verifier: match[2] };
}

/** Constant-time comparison of a verifier with the stored SHA-256 (hex). */
export function verifierMatches(verifier: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, "hex");
  const actual = createHash("sha256").update(verifier, "utf8").digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function accessLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + ACCESS_LINK_TTL_MS);
}

/** The public URL of a link (/convite/<token>), on the app's own origin. */
export function accessLinkUrl(origin: string, token: string): string {
  return new URL(`/convite/${token}`, origin).toString();
}
