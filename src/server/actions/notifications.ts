"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { visibleNotificationTypes } from "@/lib/notifications/kinds";
import { notificationPreferencesSchema } from "@/lib/notifications/preferences";
import {
  countUnreadNotifications,
  dismissNotification,
  markNotificationsRead,
  restoreNotification,
} from "@/server/domain/notifications";
import {
  getNotificationPreferences,
  setNotificationPreferences,
} from "@/server/domain/preferences";
import { getFlags, isFlagEnabled } from "@/server/flags";
import { previewReminders } from "@/server/reminders";
import { ActionError, adminAction, flaggedAction } from "@/server/safe-action";
import { throttle } from "@/server/security/throttle";

const FLAG_OFF = "As notificações não estão disponíveis.";

/**
 * The notices of Ajustes › Notificações › Avisos (doc 02 §6.14), behind the
 * notificacoes_push flag. The screen sends the whole choice on every change,
 * so the last one saved always wins as a whole. With alerta_dia_nao_util off
 * the screen hides "Vencimento em dia não útil", so its stored choice is
 * kept, whatever came in.
 */
export const saveNotificationPreferencesAction = flaggedAction(
  "notificacoes_push",
  FLAG_OFF,
)
  .inputSchema(notificationPreferencesSchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    let preferences = parsedInput;
    if (!(await isFlagEnabled("alerta_dia_nao_util", user.id))) {
      const stored = await getNotificationPreferences(user.id);
      preferences = {
        ...parsedInput,
        events: {
          ...parsedInput.events,
          non_business_due: stored.events.non_business_due,
        },
      };
    }
    await setNotificationPreferences(user.id, preferences);
    refresh();
  });

/**
 * "Enviar prévia dos avisos" (administrators only): the notices left on,
 * with today's data, to this device of theirs. Nothing is recorded and
 * nothing on the page changes, so no refresh().
 */
export const previewRemindersAction = adminAction
  .inputSchema(z.object({ endpoint: z.string().min(1).max(1024) }))
  .action(async ({ parsedInput, ctx: { admin } }) => {
    if (!(await isFlagEnabled("notificacoes_push", admin.id))) {
      throw new ActionError(FLAG_OFF);
    }
    const limit = await throttle(`push-preview:${admin.id}`, {
      windowSeconds: 60,
      max: 3,
    });
    if (!limit.ok) {
      throw new ActionError(
        "Você já enviou algumas prévias. Espere um minuto e tente de novo.",
      );
    }
    const outcome = await previewReminders(admin.id, parsedInput.endpoint);
    if (outcome.built > 0 && outcome.sent === 0) {
      throw new ActionError(
        outcome.removed
          ? "Este aparelho parou de aceitar notificações. Ative de novo."
          : "Não conseguimos enviar. Tente de novo em instantes.",
      );
    }
    return { sent: outcome.sent };
  });

/**
 * The bell (central_notificacoes, doc 02 §6.15). Each action answers with the
 * unread count after it, which the sheet and the icon number follow. They
 * skip refresh(): the store of the sheet is what shows the result.
 */
const BELL_OFF = "A central de notificações não está disponível.";

const noticeId = z.uuid();

/** The count of the bell for the person, read after a change. */
async function bellUnread(userId: string): Promise<{ unread: number }> {
  const types = visibleNotificationTypes(await getFlags(userId));
  return { unread: await countUnreadNotifications(userId, types) };
}

/** Some notices (`ids`) or all up to `until` ("Marcar todas como lidas"). */
export const markNotificationsReadAction = flaggedAction(
  "central_notificacoes",
  BELL_OFF,
)
  .inputSchema(
    z.union([
      z.object({ ids: z.array(noticeId).min(1).max(100) }),
      z.object({ until: z.iso.datetime() }),
    ]),
  )
  .action(async ({ parsedInput, ctx: { user } }) => {
    const types = visibleNotificationTypes(await getFlags(user.id));
    return markNotificationsRead(
      user.id,
      "ids" in parsedInput
        ? { ids: parsedInput.ids }
        : { until: new Date(parsedInput.until) },
      types,
    );
  });

export const dismissNotificationAction = flaggedAction(
  "central_notificacoes",
  BELL_OFF,
)
  .inputSchema(z.object({ id: noticeId }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    if (!(await dismissNotification(user.id, parsedInput.id))) {
      throw new ActionError("Não encontramos esta notificação.");
    }
    return bellUnread(user.id);
  });

export const restoreNotificationAction = flaggedAction(
  "central_notificacoes",
  BELL_OFF,
)
  .inputSchema(z.object({ id: noticeId }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    if (!(await restoreNotification(user.id, parsedInput.id))) {
      throw new ActionError("Não encontramos esta notificação.");
    }
    return bellUnread(user.id);
  });
