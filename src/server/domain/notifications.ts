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

/** The notices that list the bills they announced (`itemKeys`). */
export type BillNoticeType = "bills_due" | "non_business_due";

/**
 * The bills announced since `since` by "Contas a vencer" or, with `type`,
 * by "Vencimento em dia não útil".
 */
export async function recentBillKeys(
  userId: string,
  since: Date,
  type: BillNoticeType = "bills_due",
  executor: Executor = db,
): Promise<Set<string>> {
  const rows = await executor
    .select({ payload: notifications.payload })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        gte(notifications.createdAt, since),
      ),
    );
  return itemKeysOf(rows, type);
}

/** The bills today's (`date`) notice of `type` announced; empty when none went out. */
export async function noticeItemKeys(
  userId: string,
  type: BillNoticeType,
  date: string,
  executor: Executor = db,
): Promise<Set<string>> {
  const rows = await executor
    .select({ payload: notifications.payload })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.dedupeKey, reminderDedupeKey(type, date)),
      ),
    );
  return itemKeysOf(rows, type);
}

function itemKeysOf(
  rows: readonly { payload: NotificationPayload }[],
  type: BillNoticeType,
): Set<string> {
  const keys = new Set<string>();
  for (const { payload } of rows) {
    if (payload.type !== type) continue;
    for (const key of payload.itemKeys ?? []) keys.add(key);
  }
  return keys;
}
