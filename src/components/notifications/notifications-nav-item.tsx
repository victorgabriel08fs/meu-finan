"use client";

import { Bell } from "lucide-react";
import { useFlag } from "@/components/flags/flags-provider";
import { unreadBadgeLabel } from "@/lib/notifications/center";
import { useNotificationsStore } from "@/stores/notifications";
import { bellLabel } from "./notification-bell";

/**
 * "Notificações" in the desktop sidebar (doc 02 §4.5), above Administração
 * and Ajustes, on every screen. A button, not a link: it opens the same
 * sheet as the bell. Render it inside <Suspense fallback={null}> in the
 * sidebar's `noticesItem` slot: it reads the flag.
 */
export function NotificationsNavItem() {
  const enabled = useFlag("central_notificacoes");
  const unread = useNotificationsStore((state) => state.unread);
  const setOpen = useNotificationsStore((state) => state.setOpen);
  if (!enabled) return null;
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        data-tip="sino"
        className="relative flex h-11 w-full items-center gap-3 rounded-control px-3 text-headline text-fg-2 transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
      >
        <Bell aria-hidden="true" className="size-5" strokeWidth={1.75} />
        {/* The name comes from the visible text (WCAG 2.5.3): "Notificações, 2 não lidas".
            Chrome still adds a space before the sr-only (absolute) count,
            "Notificações , 1 não lida", which screen readers don't voice. */}
        <span>
          Notificações
          {unread > 0 ? (
            <span className="sr-only">
              {bellLabel(unread).slice("Notificações".length)}
            </span>
          ) : null}
        </span>
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-micro text-surface tabular-nums"
          >
            {unreadBadgeLabel(unread)}
          </span>
        ) : null}
      </button>
    </li>
  );
}
