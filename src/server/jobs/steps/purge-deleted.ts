import "server-only";
import { and, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { notifications, transactions } from "@/server/db/schema";
import type { JobStep } from "../runner";

/** Soft-deleted transactions stay restorable ("Desfazer", lixeira) for this many days. */
export const PURGE_RETENTION_DAYS = 30;

/** Notices read this many days ago are deleted (the unread ones stay). */
export const READ_NOTIFICATION_RETENTION_DAYS = 90;

/**
 * Hard-deletes transactions soft-deleted more than {@link PURGE_RETENTION_DAYS}
 * days ago (tags go with them, ON DELETE CASCADE) and notices read more than
 * {@link READ_NOTIFICATION_RETENTION_DAYS} days ago. Uses the database
 * clock, so the cutoff does not depend on the function's clock.
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
    const readNotices = await db
      .delete(notifications)
      .where(
        and(
          isNotNull(notifications.readAt),
          lt(
            notifications.readAt,
            sql`now() - make_interval(days => ${READ_NOTIFICATION_RETENTION_DAYS}::int)`,
          ),
        ),
      )
      .returning({ id: notifications.id });

    return {
      status: "ok",
      details: {
        purgedTransactions: purged.length,
        retentionDays: PURGE_RETENTION_DAYS,
        purgedNotifications: readNotices.length,
        notificationRetentionDays: READ_NOTIFICATION_RETENTION_DAYS,
      },
    };
  },
};
