// The notices of the daily job in the notifications table (doc 01 §6.3,
// §10). The unique (user_id, dedupe_key) is what keeps each one to once a
// day: `{evento}:{data local}`, claimed before sending.
import { and, eq, gte, inArray } from "drizzle-orm";
import { REMINDER_EVENTS } from "@/lib/notifications/events";
import { db, type Executor } from "@/server/db/client";
import {
  type NotificationPayload,
  notifications,
  type ReminderNotificationType,
} from "@/server/db/schema";

export type ReminderPayload = Extract<
  NotificationPayload,
  { type: ReminderNotificationType }
>;

/** `weekly_summary:2026-11-09`. */
export function reminderDedupeKey(
  type: ReminderNotificationType,
  date: string,
): string {
  return `${type}:${date}`;
}

/**
 * Reserves today's notice before it is sent. Null when it already exists:
 * sent earlier, or by a run going on at the same time.
 */
export async function claimNotification(
  userId: string,
  payload: ReminderPayload,
  executor: Executor = db,
): Promise<string | null> {
  const [row] = await executor
    .insert(notifications)
    .values({
      userId,
      type: payload.type,
      dedupeKey: reminderDedupeKey(payload.type, payload.date),
      payload,
    })
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning({ id: notifications.id });
  return row?.id ?? null;
}

/** Gives a claimed notice back when no device got it, so the next run retries. */
export async function releaseNotification(
  id: string,
  userId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

/** The dedupe keys of the notices the person already got for `date`. */
export async function todaysReminderKeys(
  userId: string,
  date: string,
  executor: Executor = db,
): Promise<Set<string>> {
  const rows = await executor
    .select({ dedupeKey: notifications.dedupeKey })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(
          notifications.dedupeKey,
          REMINDER_EVENTS.map((event) => reminderDedupeKey(event, date)),
        ),
      ),
    );
  return new Set(rows.map((row) => row.dedupeKey));
}

/** The bills announced by "Contas a vencer" since `since`. */
export async function recentBillKeys(
  userId: string,
  since: Date,
  executor: Executor = db,
): Promise<Set<string>> {
  const rows = await executor
    .select({ payload: notifications.payload })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "bills_due"),
        gte(notifications.createdAt, since),
      ),
    );
  const keys = new Set<string>();
  for (const { payload } of rows) {
    if (payload.type !== "bills_due") continue;
    for (const key of payload.itemKeys ?? []) keys.add(key);
  }
  return keys;
}
