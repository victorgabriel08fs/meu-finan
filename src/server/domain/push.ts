// Web Push subscriptions per person (doc 01 §10): one row per device that
// turned notifications on. Sending lives in src/server/push; the unread count
// behind the number on the app icon, in src/server/domain/notifications.
//
// One device, several accounts: a browser has a single subscription (one
// endpoint), so it belongs to whoever turned notifications on last there,
// and whoever is signed in on the device takes it from anyone before them
// (devicePushState). Nobody keeps getting notices on a device someone else
// now uses.
import { and, count, eq } from "drizzle-orm";
import type { PushSubscriptionInput } from "@/lib/push/subscription";
import { db, type Executor } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";

/** The user agent is only a hint for people; long ones are cut. */
const USER_AGENT_MAX = 300;

/** Saves this device's subscription for the person (taking it from anyone). */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
  executor: Executor = db,
): Promise<void> {
  const values = {
    userId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent?.slice(0, USER_AGENT_MAX) || null,
  };
  await executor
    .insert(pushSubscriptions)
    .values({ endpoint: subscription.endpoint, ...values })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ...values, createdAt: new Date() },
    });
}

/** Turns notifications off for one of the person's devices. */
export async function removePushSubscription(
  userId: string,
  endpoint: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

/**
 * Whether this device (its endpoint) sends the person's notifications. A
 * device that still sends someone else's stops doing so here: that person
 * is no longer the one signed in on it. Only the browser holding the
 * subscription knows its endpoint, so nobody can stop another person's
 * notifications on a device they do not have.
 */
export async function devicePushState(
  userId: string,
  endpoint: string,
  executor: Executor = db,
): Promise<"on" | "off"> {
  const [row] = await executor
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  if (!row) return "off";
  if (row.userId === userId) return "on";
  await executor
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  return "off";
}

export type PushTarget = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** The person's devices that receive notifications (or just one of them). */
export async function listPushTargets(
  userId: string,
  { endpoint, executor = db }: { endpoint?: string; executor?: Executor } = {},
): Promise<PushTarget[]> {
  const rows = await executor
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        endpoint ? eq(pushSubscriptions.endpoint, endpoint) : undefined,
      ),
    );
  return rows.map(({ id, endpoint, p256dh, auth }) => ({
    id,
    endpoint,
    keys: { p256dh, auth },
  }));
}

/** How many of the person's devices receive notifications. */
export async function countPushDevices(
  userId: string,
  executor: Executor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return row?.total ?? 0;
}

/** A device the push service says is gone (unsubscribed or expired). */
export async function dropPushTarget(
  id: string,
  executor: Executor = db,
): Promise<void> {
  await executor.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}
