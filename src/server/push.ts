// Sends Web Push notifications (doc 01 §10) to a person's devices, through
// the browsers' push services (Apple, Google, Mozilla), signed with the
// app's VAPID keys. The service worker (public/sw.js) shows each one and
// sets the number on the app icon.
import "server-only";
import webpush, { WebPushError } from "web-push";
import { visibleNotificationTypes } from "@/lib/notifications/kinds";
import {
  badgeNumber,
  isAppPath,
  type PushMessage,
  withNoticeParam,
} from "@/lib/push/subscription";
import { countUnreadNotifications } from "@/server/domain/notifications";
import { dropPushTarget, listPushTargets } from "@/server/domain/push";
import { appOrigin, readServerEnv } from "@/server/env";
import { loadFlags } from "@/server/flags";

export type VapidKeys = { publicKey: string; privateKey: string };

/** The VAPID pair, or null while either half is missing. */
export function vapidKeys(): VapidKeys | null {
  const publicKey = readServerEnv("VAPID_PUBLIC_KEY");
  const privateKey = readServerEnv("VAPID_PRIVATE_KEY");
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/**
 * Who sends, for the push services: the owner's e-mail, or else the app's
 * address. Apple refuses a subject it cannot reach (localhost).
 */
function vapidSubject(): string {
  const owner = readServerEnv("OWNER_EMAIL");
  return owner ? `mailto:${owner}` : appOrigin();
}

export type PushOutcome = {
  /** Devices the push service accepted the notification for. */
  sent: number;
  /** Devices that were gone (unsubscribed, expired) and are now forgotten. */
  removed: number;
  /** Devices that refused or failed for another reason (logged). */
  failed: number;
};

const NOTHING_SENT: PushOutcome = { sent: 0, removed: 0, failed: 0 };

type SendOptions = {
  /** Only this device (e.g. "Enviar notificação de teste"). */
  endpoint?: string;
  /** Icon number to show; defaults to the person's unread notices. */
  badge?: number;
  /**
   * The notice in the bell this push announces: the page it opens gets
   * `?aviso={id}`, so opening it there marks the notice as read.
   */
  noticeId?: string;
  /** How long the push service keeps it for an offline device, in seconds. */
  ttlSeconds?: number;
};

/**
 * Sends one notification to every device of the person (or one of them).
 * Skips everything while the notificacoes_push flag is off for the person
 * or the VAPID keys are missing, so callers need no checks of their own.
 * Never throws for a device: each one's outcome is counted instead.
 */
export async function sendPush(
  userId: string,
  message: Omit<PushMessage, "badge">,
  { endpoint, badge, noticeId, ttlSeconds = 24 * 60 * 60 }: SendOptions = {},
): Promise<PushOutcome> {
  const keys = vapidKeys();
  if (!keys) return NOTHING_SENT;
  const flags = await loadFlags(userId);
  if (!flags.notificacoes_push) return NOTHING_SENT;
  const targets = await listPushTargets(userId, { endpoint });
  if (targets.length === 0) return NOTHING_SENT;

  const url = isAppPath(message.url) ? message.url : "/inicio";
  const payload: PushMessage = {
    ...message,
    url: noticeId ? withNoticeParam(url, noticeId) : url,
    badge: badgeNumber(
      badge ??
        (await countUnreadNotifications(
          userId,
          visibleNotificationTypes(flags),
        )),
    ),
  };
  const body = JSON.stringify(payload);
  const vapidDetails = { subject: vapidSubject(), ...keys };

  const outcomes = await Promise.all(
    targets.map(async (target): Promise<keyof PushOutcome> => {
      try {
        await webpush.sendNotification(target, body, {
          vapidDetails,
          TTL: ttlSeconds,
          urgency: "normal",
          contentEncoding: "aes128gcm",
          timeout: 10_000,
        });
        return "sent";
      } catch (error) {
        // 404/410: the browser dropped the subscription (turned off in the
        // phone's settings, app removed from the home screen, expired).
        if (
          error instanceof WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          await dropPushTarget(target.id);
          return "removed";
        }
        // Only the push service's host: the endpoint itself is a credential.
        console.error("[push] could not send", {
          service: new URL(target.endpoint).host,
          status: error instanceof WebPushError ? error.statusCode : undefined,
          reason:
            error instanceof WebPushError
              ? error.body.slice(0, 200)
              : String(error),
        });
        return "failed";
      }
    }),
  );
  const outcome = { ...NOTHING_SENT };
  for (const key of outcomes) outcome[key] += 1;
  return outcome;
}
