import "server-only";
import { db } from "@/server/db/client";
import { jobRuns } from "@/server/db/schema";
import { throttle } from "@/server/security/throttle";
import type { JobRunStore } from "./runner";

export const dbJobRunStore: JobRunStore = {
  async start({ id, job, startedAt }) {
    await db.insert(jobRuns).values({ id, job, startedAt, status: "running" });
  },

  async finish({ id, job, startedAt, finishedAt, status, report }) {
    // Upsert: the row may be missing when the insert in `start` failed.
    await db
      .insert(jobRuns)
      .values({ id, job, startedAt, finishedAt, status, report })
      .onConflictDoUpdate({
        target: jobRuns.id,
        set: { finishedAt, status, report },
      });
  },
};

/**
 * Vercel called the cron route and was refused (no CRON_SECRET, or a wrong
 * one): leaves a row for Administração › Rotina diária, at most one per hour,
 * with no body, no header and no secret. Never throws: the 401 goes out
 * whatever happens here.
 */
export async function recordRejectedCronCall(job: string): Promise<void> {
  try {
    const allowed = await throttle(`job-${job}-rejected`, {
      windowSeconds: 3600,
      max: 1,
    });
    if (!allowed.ok) return;
    const now = new Date();
    await db.insert(jobRuns).values({
      job,
      startedAt: now,
      finishedAt: now,
      status: "failed",
      report: {
        durationMs: 0,
        steps: [],
        trigger: "cron",
        rejected: "unauthorized",
      },
    });
  } catch (error) {
    console.error(
      "[cron] could not record the refused call",
      error instanceof Error ? error.message : error,
    );
  }
}
