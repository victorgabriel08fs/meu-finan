"use client";

import { useEffect } from "react";
import { setAppBadge } from "@/components/push/device";
import { badgeNumber } from "@/lib/push/subscription";
import { markNotificationsReadAction } from "@/server/actions/notifications";
import { useNotificationsStore } from "@/stores/notifications";
import { NotificationsSheet } from "./notifications-sheet";

/** Coming back to the app more often than this does not ask for the count. */
const RECOUNT_AFTER_MS = 60_000;

type NotificationsHostProps = {
  userId: string;
  enabled: boolean;
  unread: number;
  /** The person's time zone: it decides "Hoje" and "Esta semana". */
  timeZone: string;
};

/**
 * Client half of the notification center, mounted once in the app layout.
 * Fills the store with what the server read, reads `?aviso=` (the notice a
 * tapped push announced: it counts as read and leaves the address), checks
 * the count again when the app comes back to the foreground and keeps the
 * number on the icon equal to the unread count on a device that receives
 * the person's notifications. Renders the sheet the bell and the sidebar
 * open.
 */
export function NotificationsHost({
  userId,
  enabled,
  unread,
  timeZone,
}: NotificationsHostProps) {
  const hydrate = useNotificationsStore((state) => state.hydrate);
  const count = useNotificationsStore((state) => state.unread);
  const pushOn = useNotificationsStore((state) => state.pushOn);

  // Before paint of the children that read it; a new page load brings fresh
  // numbers, so the server's count wins here.
  useEffect(() => {
    hydrate({ userId, enabled, unread });
  }, [hydrate, userId, enabled, unread]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const notice = url.searchParams.get("aviso");
    if (notice === null) return;
    url.searchParams.delete("aviso");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    if (!enabled) return;
    void markNotificationsReadAction({ ids: [notice] }).then((result) => {
      if (result?.data) useNotificationsStore.setState(result.data);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < RECOUNT_AFTER_MS) return;
      last = Date.now();
      const state = useNotificationsStore.getState();
      void (state.open ? state.load() : state.refreshCount());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);

  useEffect(() => {
    if (enabled && pushOn) void setAppBadge(badgeNumber(count));
  }, [enabled, pushOn, count]);

  return enabled ? <NotificationsSheet timeZone={timeZone} /> : null;
}
