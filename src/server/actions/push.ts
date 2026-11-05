"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { badgeNumber, pushSubscriptionSchema } from "@/lib/push/subscription";
import {
  countUnreadNotifications,
  devicePushState,
  markNotificationsRead,
  removePushSubscription,
  savePushSubscription,
} from "@/server/domain/push";
import { isFlagEnabled } from "@/server/flags";
import { sendPush, vapidKeys } from "@/server/push";
import { ActionError, authAction, flaggedAction } from "@/server/safe-action";
import { throttle } from "@/server/security/throttle";

/**
 * Notifications on this device (Ajustes › Notificações, doc 02 §6.14), behind
 * the notificacoes_push flag. The browser holds the switch's state (its push
 * subscription), so these skip refresh(): nothing on the page is rendered
 * from them. Turning off and the device sync stay open with the flag off, so
 * nobody is left with notifications they cannot stop.
 */

const FLAG_OFF = "As notificações não estão disponíveis.";
const endpoint = z.string().min(1).max(1024);

export const subscribePushAction = flaggedAction("notificacoes_push", FLAG_OFF)
  .inputSchema(z.object({ subscription: pushSubscriptionSchema }))
  .action(async ({ parsedInput: { subscription }, ctx: { user } }) => {
    if (!vapidKeys()) {
      throw new ActionError("O envio de notificações não está configurado.");
    }
    const userAgent = (await headers()).get("user-agent");
    await savePushSubscription(user.id, subscription, userAgent);
  });

/** Turns this device off; also run before signing out (see forgetDevice). */
export const unsubscribePushAction = authAction
  .inputSchema(z.object({ endpoint }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    await removePushSubscription(user.id, parsedInput.endpoint);
  });

/**
 * On every page load of the app: whether this device sends the person's
 * notifications (taking it over from whoever used it before) and the number
 * for the app icon, which is only shown on a device that is theirs. Opening
 * the app marks the notices as read, so the number goes back to zero.
 */
export const syncPushDeviceAction = authAction
  .inputSchema(z.object({ endpoint: endpoint.nullable() }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    await markNotificationsRead(user.id);
    const state = parsedInput.endpoint
      ? await devicePushState(user.id, parsedInput.endpoint)
      : "off";
    const on =
      state === "on" && (await isFlagEnabled("notificacoes_push", user.id));
    return {
      on,
      badge: on ? badgeNumber(await countUnreadNotifications(user.id)) : 0,
    };
  });

/** "Enviar notificação de teste", to this device only. */
export const sendTestPushAction = flaggedAction("notificacoes_push", FLAG_OFF)
  .inputSchema(z.object({ endpoint }))
  .action(async ({ parsedInput, ctx: { user } }) => {
    const limit = await throttle(`push-test:${user.id}`, {
      windowSeconds: 60,
      max: 3,
    });
    if (!limit.ok) {
      throw new ActionError(
        "Você já enviou alguns testes. Espere um minuto e tente de novo.",
      );
    }
    const unread = await countUnreadNotifications(user.id);
    const outcome = await sendPush(
      user.id,
      {
        title: "Meu Finan",
        body: "Notificação de teste: tudo certo neste aparelho. O número no ícone some quando você abre o app.",
        url: "/ajustes/notificacoes",
        tag: "teste",
      },
      // One more than the unread notices, so the icon shows a number; the
      // app sets the real count again once it opens.
      { endpoint: parsedInput.endpoint, badge: unread + 1, ttlSeconds: 60 },
    );
    if (outcome.sent === 0) {
      throw new ActionError(
        outcome.removed > 0
          ? "Este aparelho parou de aceitar notificações. Ative de novo."
          : "Não conseguimos enviar. Tente de novo em instantes.",
      );
    }
  });
