// The notifications table (doc 01 §6.3, §10): the notices of the daily job
// and what the notification center (the bell, doc 02 §6.15) lists, counts,
// reads and dismisses. The unique (user_id, dedupe_key) is what keeps each
// one to once a day: `{evento}:{data local}`, claimed before sending. Every
// function takes the person's id and filters by it, ids received included.
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { REMINDER_EVENTS } from "@/lib/notifications/events";
import { db, type Executor } from "@/server/db/client";
import {
  type NotificationPayload,
  type NotificationType,
  notifications,
  type ReminderNotificationType,
  transactions,
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

// The notification center ---------------------------------------------------

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  readAt: Date | null;
  createdAt: Date;
};

/** Page size of the bell's list. */
export const NOTIFICATIONS_PAGE_SIZE = 30;

/**
 * The person's notices of `types` (the kinds they can see), newest first,
 * dismissed ones left out. `before` is the cursor: the `createdAt` of the
 * last item of the previous page. `hasMore` says another page follows.
 */
export async function listNotifications(
  userId: string,
  {
    types,
    limit = NOTIFICATIONS_PAGE_SIZE,
    before,
  }: { types: readonly NotificationType[]; limit?: number; before?: Date },
  executor: Executor = db,
): Promise<{ items: NotificationRow[]; hasMore: boolean }> {
  if (types.length === 0 || limit <= 0) return { items: [], hasMore: false };
  const rows = await executor
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.dismissedAt),
        inArray(notifications.type, [...types]),
        before
          ? sql`date_trunc('milliseconds', ${notifications.createdAt}) < ${before.toISOString()}::timestamptz`
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Unread, not dismissed notices of `types`: the bell's number and the icon's. */
export async function countUnreadNotifications(
  userId: string,
  types: readonly NotificationType[],
  executor: Executor = db,
): Promise<number> {
  if (types.length === 0) return 0;
  const [row] = await executor
    .select({ total: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
        inArray(notifications.type, [...types]),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Marks notices as read: the ones in `ids` (that are the person's), or every
 * one created up to `until` ("Marcar todas como lidas": what arrived after
 * the newest listed item stays unread). Returns the unread count after.
 */
export async function markNotificationsRead(
  userId: string,
  target: { ids: readonly string[] } | { until: Date },
  types: readonly NotificationType[],
  executor: Executor = db,
): Promise<{ unread: number }> {
  const scope =
    "ids" in target
      ? target.ids.length > 0
        ? inArray(notifications.id, [...target.ids])
        : sql`false`
      : sql`date_trunc('milliseconds', ${notifications.createdAt}) <= ${target.until.toISOString()}::timestamptz`;
  await executor
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
        scope,
      ),
    );
  return { unread: await countUnreadNotifications(userId, types, executor) };
}

/**
 * Takes a notice off the list. The row stays (the daily job reads it to not
 * repeat itself) and counts as read. False when it is not the person's.
 */
export async function dismissNotification(
  userId: string,
  id: string,
  executor: Executor = db,
): Promise<boolean> {
  const now = new Date();
  const rows = await executor
    .update(notifications)
    .set({
      dismissedAt: now,
      readAt: sql`coalesce(${notifications.readAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** "Desfazer" of a dismissal: back on the list, as read. */
export async function restoreNotification(
  userId: string,
  id: string,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(notifications)
    .set({ dismissedAt: null })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/**
 * Records a notice once per `dedupeKey`; false when it already exists. For
 * the writers that notify inside their own transaction (pass its `tx`).
 */
export async function recordNotification(
  executor: Executor,
  userId: string,
  type: NotificationType,
  dedupeKey: string,
  payload: NotificationPayload,
): Promise<boolean> {
  const rows = await executor
    .insert(notifications)
    .values({ userId, type, dedupeKey, payload })
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/**
 * Records or updates one notice that gathers many events (one a day per
 * actor, say): the new payload replaces the old one except the numeric
 * fields named in `sum`, which add up. The notice comes back to the top of
 * the list as unread. One statement, so two events at once both count.
 */
export async function bumpNotification(
  executor: Executor,
  userId: string,
  type: NotificationType,
  dedupeKey: string,
  payload: NotificationPayload,
  { sum = [] }: { sum?: readonly string[] } = {},
): Promise<void> {
  const added = sum.map(
    (field) =>
      sql`${field}::text, coalesce((${sql.raw('"notifications"."payload"')}->>${field})::numeric, 0) + coalesce((excluded.payload->>${field})::numeric, 0)`,
  );
  const merged =
    added.length > 0
      ? sql`excluded.payload || jsonb_build_object(${sql.join(added, sql`, `)})`
      : sql`excluded.payload`;
  await executor
    .insert(notifications)
    .values({ userId, type, dedupeKey, payload })
    .onConflictDoUpdate({
      target: [notifications.userId, notifications.dedupeKey],
      set: {
        payload: merged,
        createdAt: sql`now()`,
        readAt: null,
        dismissedAt: null,
      },
    });
}

/**
 * Which of the transaction ids are the person's own entries still pending:
 * a notice offers "Marcar como pago" only for those.
 */
export async function pendingTransactionIds(
  userId: string,
  ids: readonly string[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await executor
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        inArray(transactions.id, [...ids]),
        eq(transactions.userId, userId),
        eq(transactions.status, "pending"),
        isNull(transactions.deletedAt),
      ),
    );
  return new Set(rows.map((row) => row.id));
}
