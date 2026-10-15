import "server-only";
import { db } from "@/server/db/client";
import { jobRuns } from "@/server/db/schema";
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
