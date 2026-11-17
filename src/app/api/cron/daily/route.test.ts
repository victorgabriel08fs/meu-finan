import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runDailyJob = vi.fn();
vi.mock("@/server/jobs/daily", () => ({
  DAILY_JOB: "daily",
  runDailyJob: (...args: unknown[]) => runDailyJob(...args),
}));
vi.mock("@/server/jobs/job-run-store", () => ({
  recordRejectedCronCall: vi.fn(async () => {}),
}));

const captureCheckIn = vi.fn(() => "check-in-id");
const flush = vi.fn(async () => true);
const sentrySdk = vi.fn();
const captureServerMessage = vi.fn();
const captureServerError = vi.fn();
vi.mock("@/server/observability/sentry", () => ({
  sentrySdk: () => sentrySdk(),
  captureServerMessage: (...args: unknown[]) => captureServerMessage(...args),
  captureServerError: (...args: unknown[]) => captureServerError(...args),
}));

const SECRET = "c".repeat(40);
const { GET } = await import("./route");

const call = (userAgent: string, secret = SECRET) =>
  GET(
    new Request("http://localhost/api/cron/daily", {
      headers: { authorization: `Bearer ${secret}`, "user-agent": userAgent },
    }),
  );

const summary = (status: string, steps: unknown[] = []) => ({
  status,
  durationMs: 2000,
  steps,
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  sentrySdk.mockReturnValue(Promise.resolve({ captureCheckIn, flush }));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/cron/daily monitoring", () => {
  it("checks in as in progress and ok for Vercel's cron", async () => {
    runDailyJob.mockResolvedValue(summary("ok"));
    const response = await call("vercel-cron/1.0");
    expect(response.status).toBe(200);
    expect(captureCheckIn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "in_progress" }),
      expect.objectContaining({ checkinMargin: 60 }),
    );
    expect(captureCheckIn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "ok", checkInId: "check-in-id" }),
    );
  });

  it("reports a failed run and each failed step by name only", async () => {
    runDailyJob.mockResolvedValue(
      summary("failed", [
        { name: "syncRates", status: "failed", error: "segredo" },
      ]),
    );
    const response = await call("vercel-cron/1.0");
    expect(response.status).toBe(500);
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
    expect(captureServerMessage).toHaveBeenCalledWith(
      "cron.daily.step_failed",
      "error",
      { job: "daily", step: "syncRates" },
    );
  });

  it("reports a crash", async () => {
    runDailyJob.mockRejectedValue(new Error("boom"));
    const response = await call("vercel-cron/1.0");
    expect(response.status).toBe(500);
    expect(captureServerError).toHaveBeenCalled();
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });

  it("does not check in for a manual call", async () => {
    runDailyJob.mockResolvedValue(summary("ok"));
    await call("curl/8");
    expect(sentrySdk).not.toHaveBeenCalled();
    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("reports a rejected call from Vercel", async () => {
    const response = await call("vercel-cron/1.0", "errado");
    expect(response.status).toBe(401);
    expect(captureServerMessage).toHaveBeenCalledWith(
      "cron.daily.rejected",
      "error",
    );
  });

  it("answers the same without Sentry", async () => {
    sentrySdk.mockReturnValue(null);
    runDailyJob.mockResolvedValue(summary("ok"));
    const response = await call("vercel-cron/1.0");
    expect(response.status).toBe(200);
    expect(captureCheckIn).not.toHaveBeenCalled();
  });
});
