import {
  cronCheckInStatus,
  DAILY_MONITOR_CONFIG,
  DAILY_MONITOR_SLUG,
} from "@/lib/observability/cron-monitor";
import { readServerEnv } from "@/server/env";
import { isAuthorizedCronRequest } from "@/server/jobs/cron-auth";
import { DAILY_JOB, runDailyJob } from "@/server/jobs/daily";
import { recordRejectedCronCall } from "@/server/jobs/job-run-store";
import { logEvent } from "@/server/observability/log";
import {
  captureServerError,
  captureServerMessage,
  sentrySdk,
} from "@/server/observability/sentry";

export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Daily job, called by Vercel Cron in production (vercel.json) with
 * `Authorization: Bearer <CRON_SECRET>`. This route is outside the session
 * check on purpose: the cron secret is its only credential, and it fails
 * closed when the secret is missing or invalid.
 */
export async function GET(request: Request): Promise<Response> {
  // Read the header first: request data also keeps this handler out of prerendering.
  const authorization = request.headers.get("authorization");
  // Only a label of who called (the secret is the credential): Vercel Cron
  // sends `vercel-cron/1.0`. To be confirmed on the first real cron run.
  const fromVercel = (request.headers.get("user-agent") ?? "").startsWith(
    "vercel-cron/",
  );
  if (!isAuthorizedCronRequest(authorization, cronSecret())) {
    if (fromVercel) {
      await recordRejectedCronCall(DAILY_JOB);
      logEvent("cron.daily.rejected", {}, "error");
      captureServerMessage("cron.daily.rejected", "error");
    }
    return Response.json(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Não autorizado." },
      },
      { status: 401, headers: NO_STORE },
    );
  }

  // Check-ins only for Vercel's own cron, so a manual call never hides a missed run.
  const sentry = fromVercel ? await sentrySdk() : null;
  const checkInId = sentry?.captureCheckIn(
    { monitorSlug: DAILY_MONITOR_SLUG, status: "in_progress" },
    DAILY_MONITOR_CONFIG,
  );
  try {
    const trigger = fromVercel ? "cron" : "manual";
    const summary = await runDailyJob({ trigger });
    const failed = summary.status === "failed";
    const failedSteps = summary.steps.filter(
      (step) => step.status === "failed" || step.status === "partial",
    );
    // Only the step name goes out; the error text stays in job_runs.
    for (const step of failedSteps) {
      captureServerMessage(
        "cron.daily.step_failed",
        failed ? "error" : "warning",
        { job: DAILY_JOB, step: step.name },
      );
    }
    sentry?.captureCheckIn({
      checkInId,
      monitorSlug: DAILY_MONITOR_SLUG,
      status: cronCheckInStatus(summary.status),
      duration: summary.durationMs / 1000,
    });
    logEvent(
      "cron.daily.finished",
      {
        status: summary.status,
        durationMs: summary.durationMs,
        trigger,
        failedSteps: failedSteps.map((step) => step.name).join(",") || null,
      },
      summary.status === "ok" ? "info" : "error",
    );
    return Response.json(
      { ok: !failed, ...summary },
      { status: failed ? 500 : 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("[cron] the daily job crashed", error);
    captureServerError(error, { job: DAILY_JOB });
    sentry?.captureCheckIn({
      checkInId,
      monitorSlug: DAILY_MONITOR_SLUG,
      status: "error",
    });
    return Response.json(
      {
        ok: false,
        error: { code: "INTERNAL", message: "O job diário falhou." },
      },
      { status: 500, headers: NO_STORE },
    );
  } finally {
    await sentry?.flush(2000);
  }
}

function cronSecret(): string | undefined {
  try {
    const secret = readServerEnv("CRON_SECRET");
    if (secret === undefined)
      console.warn("[cron] CRON_SECRET is not set; refusing the request");
    return secret;
  } catch (error) {
    console.error("[cron]", error instanceof Error ? error.message : error);
    return undefined;
  }
}
