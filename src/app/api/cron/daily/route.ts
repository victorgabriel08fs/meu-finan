import { readServerEnv } from "@/server/env";
import { isAuthorizedCronRequest } from "@/server/jobs/cron-auth";
import { DAILY_JOB, runDailyJob } from "@/server/jobs/daily";
import { recordRejectedCronCall } from "@/server/jobs/job-run-store";

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
    if (fromVercel) await recordRejectedCronCall(DAILY_JOB);
    return Response.json(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Não autorizado." },
      },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const summary = await runDailyJob({
      trigger: fromVercel ? "cron" : "manual",
    });
    const failed = summary.status === "failed";
    return Response.json(
      { ok: !failed, ...summary },
      { status: failed ? 500 : 200, headers: NO_STORE },
    );
  } catch (error) {
    console.error("[cron] the daily job crashed", error);
    return Response.json(
      {
        ok: false,
        error: { code: "INTERNAL", message: "O job diário falhou." },
      },
      { status: 500, headers: NO_STORE },
    );
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
