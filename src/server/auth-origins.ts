// Origins Better Auth and the passkey plugin accept (doc 01 §11.2). Pure: the
// caller reads the environment (src/server/env.ts) and passes it in.
//
// A request whose Origin is not the base URL or a trusted origin gets a 403
// INVALID_ORIGIN from Better Auth, and a passkey only works on the domain
// (rpID) it was registered on. Moving to another domain therefore invalidates
// the old passkeys: sign in with the password and register a new one in
// Ajustes › Segurança.

export const DEFAULT_ORIGIN = "http://localhost:3000";

export type AuthOriginsInput = {
  /** BETTER_AUTH_URL. */
  baseUrl?: string;
  /** VERCEL_PROJECT_PRODUCTION_URL, already limited to production by the caller. A bare hostname. */
  vercelProductionUrl?: string;
  /** PASSKEY_RP_ID: a bare hostname; default is the base origin's hostname. */
  rpId?: string;
  /** BETTER_AUTH_TRUSTED_ORIGINS: comma-separated URLs. */
  trusted?: string;
};

export type AuthOrigins = {
  origin: string;
  rpId: string;
  passkeyOrigins: string[];
  trustedOrigins: string[];
};

/** Origin of an http(s) URL, or undefined when it is not one (wildcards included). */
export function toOrigin(value: string): string | undefined {
  const raw = value.trim();
  if (!raw || raw.includes("*")) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseTrustedOrigins(trusted: string | undefined): string[] {
  const origins = (trusted ?? "")
    .split(",")
    .map(toOrigin)
    .filter((origin): origin is string => origin !== undefined);
  return [...new Set(origins)];
}

function withinRpId(origin: string, rpId: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

export function resolveAuthOrigins(input: AuthOriginsInput): AuthOrigins {
  const vercel = input.vercelProductionUrl?.trim()
    ? `https://${input.vercelProductionUrl.trim()}`
    : undefined;
  const origin =
    (input.baseUrl && toOrigin(input.baseUrl)) ||
    (vercel && toOrigin(vercel)) ||
    DEFAULT_ORIGIN;

  const rpId = input.rpId?.trim().toLowerCase() || new URL(origin).hostname;
  const trustedOrigins = parseTrustedOrigins(input.trusted).filter(
    (trusted) => trusted !== origin,
  );
  // An origin outside the rpID cannot use the passkeys: left out, not an error.
  const passkeyOrigins = [origin, ...trustedOrigins].filter((candidate) =>
    withinRpId(candidate, rpId),
  );

  return { origin, rpId, passkeyOrigins, trustedOrigins };
}
