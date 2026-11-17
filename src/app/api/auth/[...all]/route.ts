import { toNextJsHandler } from "better-auth/next-js";
import { rateLimitedPath } from "@/lib/observability/auth-events";
import { auth } from "@/server/auth";
import { logEvent, requestMeta } from "@/server/observability/log";
import { captureServerMessage } from "@/server/observability/sentry";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request): Promise<Response> {
  const response = await handlers.POST(request);
  // The limiter answers before Better Auth's hooks run, so 429 is seen here.
  if (response.status === 429) {
    const path = rateLimitedPath(new URL(request.url).pathname);
    logEvent(
      "auth.rate_limited",
      { path, ...requestMeta(request.headers) },
      "warn",
    );
    captureServerMessage("auth.rate_limited", "warning", { path });
  }
  return response;
}
