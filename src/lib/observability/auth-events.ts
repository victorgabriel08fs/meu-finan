// Classifies the outcome of a Better Auth call for the access log. Pure.

export const AUTH_PATHS = {
  "/sign-in/email": "password",
  "/passkey/verify-authentication": "passkey",
  "/change-password": "change_password",
} as const;

export type AuthMethod =
  | (typeof AUTH_PATHS)[keyof typeof AUTH_PATHS]
  | "google";
export type AuthEventName =
  | "auth.sign_in"
  | "auth.sign_in_failed"
  | "auth.password_changed"
  | "auth.password_change_failed"
  | "auth.social_linked"
  | "auth.social_unlinked";

/** The paths of `rateLimit.customRules` in src/server/auth.ts. */
export const RATE_LIMITED_PATHS = [
  "/sign-in/email",
  "/sign-up/email",
  "/change-password",
  "/passkey/verify-authentication",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-registration",
  "/sign-in/social",
  "/link-social",
  "/unlink-account",
  "/callback/*",
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

/**
 * The outcome of the Google flow for the access log. `path` is the endpoint's
 * template (the callback is "/callback/:id"); `redirectLocation` is where the
 * callback sends the browser, which carries `?error=` when it failed. The
 * callback that ends a link opens no session and has no error.
 */
export function classifySocialOutcome(input: {
  path: string;
  provider?: string;
  sessionUserId?: string | null;
  redirectLocation?: string | null;
  error?: { status: number; code?: string } | null;
}): {
  event: AuthEventName;
  method: "google";
  userId?: string;
  status?: number;
  code?: string;
} | null {
  if (input.path === "/unlink-account") {
    if (input.error || !input.sessionUserId) return null;
    return {
      event: "auth.social_unlinked",
      method: "google",
      userId: input.sessionUserId,
    };
  }
  if (!input.path.startsWith("/callback/") || input.provider !== "google") {
    return null;
  }
  const code = errorFromLocation(input.redirectLocation);
  if (code) {
    return { event: "auth.sign_in_failed", method: "google", code };
  }
  if (input.sessionUserId) {
    return {
      event: "auth.sign_in",
      method: "google",
      userId: input.sessionUserId,
    };
  }
  // A redirect without a session or an error: the end of a link.
  if (input.redirectLocation) {
    return { event: "auth.social_linked", method: "google" };
  }
  return null;
}

function errorFromLocation(location: string | null | undefined) {
  if (!location) return undefined;
  try {
    return (
      new URL(location, "http://local").searchParams.get("error") ?? undefined
    );
  } catch {
    return undefined;
  }
}

export function rateLimitedPath(pathname: string): string {
  const path = pathname.replace(/^\/api\/auth/, "");
  if (path.startsWith("/callback/")) return "/callback/*";
  return (RATE_LIMITED_PATHS as readonly string[]).includes(path)
    ? path
    : "other";
}
