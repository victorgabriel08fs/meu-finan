"use server";

import { refresh } from "next/cache";
import { notificationPreferencesSchema } from "@/lib/notifications/preferences";
import { setNotificationPreferences } from "@/server/domain/preferences";
import { flaggedAction } from "@/server/safe-action";

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
