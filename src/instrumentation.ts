import type { Instrumentation } from "next";
import { parseSentryDsn } from "@/lib/observability/dsn";
import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/scrub";

// Not @/server/env: "server-only" may throw outside the RSC layer. Same parser as env.ts.
const sentry = parseSentryDsn(process.env.SENTRY_DSN);

export async function register() {
  if (!sentry || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: sentry.dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // v11 has no sendDefaultPii: nothing personal is attached by default and scrubEvent drops `user`.
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (!sentry || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
  await Sentry.flush(2000);
};
