"use client";

import { useEffect } from "react";
import { syncPushDeviceAction } from "@/server/actions/push";
import { currentSubscription, setAppBadge } from "./device";

/** Coming back to the app more often than this does not ask again. */
const RESYNC_AFTER_MS = 30_000;

/**
 * Keeps this device in step with the signed-in person (doc 01 §10): on each
 * page load and whenever the app comes back to the foreground, it tells the
 * server which subscription the device holds (so a device someone else used
 * stops sending their notifications) and sets the number on the app icon to
 * the person's unread notices. Renders nothing. Disabled (the flag is off),
 * it only clears the icon.
 */
export function PushSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) {
      void setAppBadge(0);
      return;
    }
    let last = 0;
    let cancelled = false;

    async function sync() {
      if (Date.now() - last < RESYNC_AFTER_MS) return;
      last = Date.now();
      try {
        const subscription = await currentSubscription();
        const result = await syncPushDeviceAction({
          endpoint: subscription?.endpoint ?? null,
        });
        if (cancelled || !result?.data) return;
        await setAppBadge(result.data.badge);
      } catch {
        // Offline or no service worker: the icon keeps its number for now.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return null;
}
