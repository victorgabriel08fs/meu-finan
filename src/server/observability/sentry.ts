// Server-side Sentry helpers. The SDK is imported only when SENTRY_DSN is
// valid; without it every call is a no-op and the SDK is never loaded.
import "server-only";
import { waitUntil } from "@vercel/functions";
import { readServerEnvSafe } from "@/server/env";

type SentrySdk = typeof import("@sentry/nextjs");

let loaded: Promise<SentrySdk> | null | undefined;
let warned = false;

export function sentrySdk(): Promise<SentrySdk> | null {
  if (loaded !== undefined) return loaded;
  const dsn = readServerEnvSafe("SENTRY_DSN");
  if (dsn.status === "ok") {
    loaded = import("@sentry/nextjs");
    return loaded;
  }
  if (dsn.status === "invalid" && !warned) {
    warned = true;
    console.error(dsn.problem);
  }
  return null;
}

/** Sends an unexpected error; waits for the delivery before the function freezes. */
export function captureServerError(
  error: unknown,
  tags: Record<string, string>,
): void {
  const sdk = sentrySdk();
  if (!sdk) return;
  waitUntil(
    sdk
      .then((Sentry) => {
        Sentry.captureException(error, { tags });
        return Sentry.flush(2000);
      })
      .catch(() => {}),
  );
}

/** Sends a message; the fingerprint groups the same event and tags into one issue. */
export function captureServerMessage(
  message: string,
  level: "info" | "warning" | "error",
  tags: Record<string, string> = {},
): void {
  const sdk = sentrySdk();
  if (!sdk) return;
  waitUntil(
    sdk
      .then((Sentry) => {
        Sentry.captureMessage(message, {
          level,
          tags,
          fingerprint: [message, ...Object.values(tags)],
        });
        return Sentry.flush(2000);
      })
      .catch(() => {}),
  );
}
