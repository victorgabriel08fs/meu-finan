// Sentry DSN parsing. Pure: never throws, never logs (a DSN is not a secret,
// but a malformed value should not end up in a log either).

export type ParsedSentryDsn = { dsn: string; origin: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Validates `https://<public key>@<host>/<numeric project id>` (plain `http`
 * only for localhost) and returns the DSN with its exact origin, the one the
 * CSP `connect-src` allows. Anything else is `undefined`.
 */
export function parseSentryDsn(
  raw: string | undefined,
): ParsedSentryDsn | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return undefined;
  if (!url.username) return undefined;
  if (!/^\/(?:[^/]+\/)*\d+$/.test(url.pathname)) return undefined;
  return { dsn: value, origin: url.origin };
}

export function isValidSentryDsn(raw: string | undefined): boolean {
  return parseSentryDsn(raw) !== undefined;
}
