import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import type { JobStep } from "../runner";

/** Soft-deleted transactions stay restorable ("Desfazer", lixeira) for this many days. */
export const PURGE_RETENTION_DAYS = 30;

/**
 * Hard-deletes transactions soft-deleted more than {@link PURGE_RETENTION_DAYS}
 * days ago. Tags go with them (ON DELETE CASCADE). Uses the database clock, so
 * the cutoff does not depend on the function's clock.
 */
export const purgeDeleted: JobStep = {
  name: "purgeDeleted",
  async run() {
    // returning() keeps the count driver-agnostic (Neon and PGlite report
    // affected rows differently).
    const purged = await db
      .delete(transactions)
      .where(
        lt(
          transactions.deletedAt,
          sql`now() - make_interval(days => ${PURGE_RETENTION_DAYS}::int)`,
        ),
      )
      .returning({ id: transactions.id });

    return {
      status: "ok",
      details: {
        purgedTransactions: purged.length,
        retentionDays: PURGE_RETENTION_DAYS,
      },
    };
  },
};
