// Sentry Crons monitor of the daily job. The schedule must match vercel.json
// (checked by a test); on Hobby the cron fires at any moment of the hour, so
// the margin is 60 minutes.

export const DAILY_MONITOR_SLUG = "daily-job";

export const DAILY_MONITOR_CONFIG = {
  schedule: { type: "crontab", value: "0 9 * * *" },
  checkinMargin: 60,
  maxRuntime: 10,
  timezone: "Etc/UTC",
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const;

export function cronCheckInStatus(
  status: "ok" | "partial" | "failed",
): "ok" | "error" {
  return status === "failed" ? "error" : "ok";
}
