// Classifies the outcome of a Better Auth call for the access log. Pure.

export const AUTH_PATHS = {
  "/sign-in/email": "password",
  "/passkey/verify-authentication": "passkey",
  "/change-password": "change_password",
} as const;

export type AuthMethod = (typeof AUTH_PATHS)[keyof typeof AUTH_PATHS];
export type AuthEventName =
  | "auth.sign_in"
  | "auth.sign_in_failed"
  | "auth.password_changed"
  | "auth.password_change_failed";

/** The paths of `rateLimit.customRules` in src/server/auth.ts. */
export const RATE_LIMITED_PATHS = [
  "/sign-in/email",
  "/sign-up/email",
  "/change-password",
  "/passkey/verify-authentication",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-registration",
] as const;

export function classifyAuthOutcome(input: {
  path: string;
  sessionUserId?: string | null;
  error?: { status: number; code?: string } | null;
}): {
  event: AuthEventName;
  method: AuthMethod;
  userId?: string;
  status?: number;
  code?: string;
} | null {
  const method = (AUTH_PATHS as Record<string, AuthMethod>)[input.path];
  if (!method) return null;
  const changing = method === "change_password";
  if (input.error) {
    return {
      event: changing ? "auth.password_change_failed" : "auth.sign_in_failed",
      method,
      status: input.error.status,
      code: input.error.code,
    };
  }
  if (changing) {
    return {
      event: "auth.password_changed",
      method,
      userId: input.sessionUserId ?? undefined,
    };
  }
  if (!input.sessionUserId) return null;
  return { event: "auth.sign_in", method, userId: input.sessionUserId };
}

export function rateLimitedPath(pathname: string): string {
  const path = pathname.replace(/^\/api\/auth/, "");
  return (RATE_LIMITED_PATHS as readonly string[]).includes(path)
    ? path
    : "other";
}
