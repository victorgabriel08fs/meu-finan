"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { notificationPreferencesSchema } from "@/lib/notifications/preferences";
import { setNotificationPreferences } from "@/server/domain/preferences";
import { isFlagEnabled } from "@/server/flags";
import { previewReminders } from "@/server/reminders";
import { ActionError, adminAction, flaggedAction } from "@/server/safe-action";
import { throttle } from "@/server/security/throttle";

const FLAG_OFF = "As notificações não estão disponíveis.";

/**
 * The notices of Ajustes › Notificações › Avisos (doc 02 §6.14), behind the
 * notificacoes_push flag. The screen sends the whole choice on every change,
 * so the last one saved always wins as a whole.
 */
export const saveNotificationPreferencesAction = flaggedAction(
  "notificacoes_push",
  FLAG_OFF,
)
  .inputSchema(notificationPreferencesSchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    await setNotificationPreferences(user.id, parsedInput);
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
