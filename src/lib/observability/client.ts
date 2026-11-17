// Browser side of the Sentry integration. The SDK is only imported when a
// public DSN exists, so without it nothing of Sentry reaches the bundle.
import { parseSentryDsn } from "./dsn";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

type SentrySdk = typeof import("@sentry/nextjs");

let sdk: Promise<SentrySdk | null> | undefined;

export function initClientSentry(dsn: string): Promise<SentrySdk | null> {
  sdk ??= (async () => {
    const parsed = parseSentryDsn(dsn);
    if (!parsed) return null;
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: parsed.dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      allowUrls: [self.location.origin],
      maxBreadcrumbs: 30,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    });
    return Sentry;
  })().catch(() => null);
  return sdk;
}

/** Sends an error of a screen to Sentry; a no-op without a public DSN. */
export function reportClientError(error: unknown): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    void initClientSentry(dsn)
      .then((Sentry) => Sentry?.captureException(error))
      .catch(() => {});
  } catch {
    // Reporting never breaks the screen.
  }
}
