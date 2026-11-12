// Pushes of the shared finances (ADR-13), sent after the transaction that
// recorded their notices commits (Server Actions call it inside `after()`).
// Each person's own choices decide: the financas_compartilhadas flag (and,
// inside sendPush, notificacoes_push and their devices), and "Mostrar valores
// nas notificações" for the text. A deactivated account gets nothing.
import "server-only";
import { and, inArray } from "drizzle-orm";
import { shareMessage } from "@/lib/sharing/messages";
import { db } from "@/server/db/client";
import { notifications, user } from "@/server/db/schema";
import { getNotificationPreferences } from "@/server/domain/preferences";
import type { PendingPush } from "@/server/domain/sharing/notices";
import { loadFlagsForUsers } from "@/server/flags";
import { sendPush } from "@/server/push";

export async function deliverPushes(
  pending: readonly PendingPush[],
): Promise<void> {
  if (pending.length === 0) return;
  try {
    const userIds = [...new Set(pending.map((item) => item.userId))];
    const [flags, accounts, notices] = await Promise.all([
      loadFlagsForUsers(userIds),
      db
        .select({ id: user.id, banned: user.banned })
        .from(user)
        .where(inArray(user.id, userIds)),
      db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          dedupeKey: notifications.dedupeKey,
        })
        .from(notifications)
        .where(
          and(
            inArray(notifications.userId, userIds),
            inArray(
              notifications.dedupeKey,
              pending.map((item) => item.dedupeKey),
            ),
          ),
        ),
    ]);
    const active = new Set(
      accounts.filter((row) => !row.banned).map((row) => row.id),
    );
    const noticeIds = new Map(
      notices.map((row) => [`${row.userId}:${row.dedupeKey}`, row.id]),
    );

    await Promise.all(
      pending.map(async (item) => {
        if (!active.has(item.userId)) return;
        if (!flags.get(item.userId)?.financas_compartilhadas) return;
        const { showAmounts } = await getNotificationPreferences(item.userId);
        const message = shareMessage(item.payload, showAmounts);
        await sendPush(
          item.userId,
          { ...message, url: item.url, tag: `grupo-${item.groupId}` },
          { noticeId: noticeIds.get(`${item.userId}:${item.dedupeKey}`) },
        );
      }),
    );
  } catch (error) {
    // The change is saved and in the bell; a push that fails is only logged.
    console.error(
      "[notify] could not send",
      error instanceof Error ? error.message : error,
    );
  }
}
