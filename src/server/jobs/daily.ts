import "server-only";
import { dbJobRunStore } from "./job-run-store";
import { type JobRunSummary, type JobStep, runJob } from "./runner";
import {
  rollInvoices,
  sendReminders,
  snapshotBalances,
} from "./steps/later-phases";
import { materializeRecurrences } from "./steps/materialize-recurrences";
import { purgeDeleted } from "./steps/purge-deleted";
import { syncMarketRates } from "./steps/sync-market-rates";

export const DAILY_JOB = "daily";

/** No step starts after 240 s, leaving time to record the run before maxDuration (300 s). */
export const DAILY_TIME_BUDGET_MS = 240_000;

/**
 * Order from docs/01 §9. Every step must be idempotent: Vercel may deliver a
 * cron event more than once, and the owner can trigger the route by hand.
 */
export const dailySteps: readonly JobStep[] = [
  materializeRecurrences,
  rollInvoices,
  syncMarketRates,
  snapshotBalances,
  sendReminders,
  purgeDeleted,
];

export function runDailyJob(): Promise<JobRunSummary> {
  return runJob({
    job: DAILY_JOB,
    steps: dailySteps,
    store: dbJobRunStore,
    budgetMs: DAILY_TIME_BUDGET_MS,
  });
}
