import { createHash, timingSafeEqual } from "node:crypto";

const BEARER = /^Bearer[ \t]+(.+)$/i;

/**
 * Checks the `Authorization` header Vercel Cron sends (`Bearer <CRON_SECRET>`).
 *
 * Fails closed: without a configured secret nothing is authorised, so a
 * missing variable can never turn into `Bearer undefined` being accepted.
 * Both sides are hashed before the constant-time comparison, which keeps
 * the comparison length-independent.
 */
export function isAuthorizedCronRequest(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;

  const token = authorization
    ? BEARER.exec(authorization.trim())?.[1]
    : undefined;
  if (!token) return false;

  return constantTimeEqual(token.trim(), secret);
}

function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
