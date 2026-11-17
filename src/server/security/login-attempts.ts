// Password sign-in attempts per e-mail, on top of Better Auth's per-IP limit:
// credential stuffing from many addresses against one account. Every attempt
// counts (atomic upsert, no race); a successful sign-in resets the counter and
// during the lock even the right password is refused. Passkeys are not
// counted: they are the way out for someone locked by an attacker. The key is
// a hash, so no e-mail sits in rate_limit; the same count applies whether or
// not the account exists.
import "server-only";
import { createHash } from "node:crypto";
import { APIError, isAPIError } from "better-auth/api";
import { LOGIN_LOCKED, loginLockedMessage } from "@/lib/security/messages";
import { clearThrottle, type ThrottleRule, throttle } from "./throttle";

export const LOGIN_EMAIL_RULE: ThrottleRule = { windowSeconds: 900, max: 10 };

function loginKey(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return null;
  return `login-email:${createHash("sha256").update(normalized).digest("hex")}`;
}

/** Before hook of /sign-in/email: counts the attempt, refuses past the limit. */
export async function countEmailSignIn(email: unknown): Promise<void> {
  const key = loginKey(email);
  if (!key) return;
  const result = await throttle(key, LOGIN_EMAIL_RULE);
  if (result.ok) return;
  const seconds = result.retryAfterSeconds;
  throw new APIError(
    "TOO_MANY_REQUESTS",
    {
      code: LOGIN_LOCKED,
      message: loginLockedMessage(seconds),
      retryAfter: seconds,
    },
    { "X-Retry-After": String(seconds) },
  );
}

/** After hook of /sign-in/email: a successful sign-in resets the counter. */
export async function settleEmailSignIn(
  email: unknown,
  returned: unknown,
): Promise<void> {
  if (isAPIError(returned)) return;
  const key = loginKey(email);
  if (key) await clearThrottle(key);
}

/** Lifts the lock: someone with a valid invite, reset link or recovery. */
export async function clearLoginAttempts(email: string): Promise<void> {
  const key = loginKey(email);
  if (key) await clearThrottle(key);
}
