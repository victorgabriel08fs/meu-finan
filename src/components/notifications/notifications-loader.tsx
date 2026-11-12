import { unstable_rethrow } from "next/navigation";
import { visibleNotificationTypes } from "@/lib/notifications/kinds";
import { getSession } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { countUnreadNotifications } from "@/server/domain/notifications";
import { getFlags } from "@/server/flags";
import { NotificationsHost } from "./notifications-host";

/**
 * Server half of the notification center (doc 02 §6.15): render it inside
 * <Suspense fallback={null}> in the app layout. Checks the session (nothing
 * runs while prerendering), reads the flag and the unread count and hands
 * them to the browser once per page load. With the flag off the host still
 * renders, only to take `?aviso=` out of the address. A failed read renders
 * nothing, like the device sync.
 */
export async function NotificationsLoader() {
  let props: {
    userId: string;
    enabled: boolean;
    unread: number;
    timeZone: string;
  };
  try {
    const session = await getSession();
    if (!session) return null;
    const userId = session.user.id;
    const flags = await getFlags(userId);
    const enabled = flags.central_notificacoes;
    const [unread, ctx] = enabled
      ? await Promise.all([
          countUnreadNotifications(userId, visibleNotificationTypes(flags)),
          getUserContext(userId),
        ])
      : [0, null];
    props = { userId, enabled, unread, timeZone: ctx?.timeZone ?? "UTC" };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[notifications] could not load the bell", error);
    return null;
  }
  return <NotificationsHost {...props} />;
}
