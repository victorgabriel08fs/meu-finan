// Pure security guards used by the auth flows. No I/O, so they are unit-tested.
import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest();

/**
 * Constant-time comparison of a provided secret (setup or recovery token) with
 * the expected one. Hashing first gives both sides the same length, so the time
 * taken reveals neither the length nor the content. Fails closed: false when
 * either side is missing or empty.
 */
export function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True only when both e-mails exist and match case-insensitively. */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | null | undefined,
): boolean {
  if (!email || !ownerEmail) return false;
  return normalizeEmail(email) === normalizeEmail(ownerEmail);
}

const AUTH_PAGES = ["/entrar", "/primeiro-acesso", "/recuperar", "/convite"];
const PROBE_ORIGIN = "http://meu-finan.invalid";

/**
 * Validates the ?voltar= target after login: only same-origin relative paths
 * ("/extrato?mes=2026-10"). Rejects absolute and protocol-relative URLs,
 * backslash tricks, control characters and the auth pages themselves.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/inicio",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  if (
    AUTH_PAGES.some(
      (page) => url.pathname === page || url.pathname.startsWith(`${page}/`),
    )
  ) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Client address for throttling keys: first X-Forwarded-For hop (set by Vercel). */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}
