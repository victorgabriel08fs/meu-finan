"use client";

import { Bell } from "lucide-react";
import { Suspense } from "react";
import { useFlag } from "@/components/flags/flags-provider";
import { IconButton } from "@/components/ui/icon-button";
import { unreadBadgeLabel } from "@/lib/notifications/center";
import { useNotificationsStore } from "@/stores/notifications";

/** "Notificações" or "Notificações, 3 não lidas". */
export function bellLabel(unread: number): string {
  if (unread <= 0) return "Notificações";
  return `Notificações, ${unread} ${unread === 1 ? "não lida" : "não lidas"}`;
}

/**
 * The bell of the Início header (doc 02 §4.2, §6.15): opens the notification
 * center and carries the number of unread notices. Only exists with the
 * central_notificacoes flag: the flag is read inside its own <Suspense>, which
 * holds the bell's 44px until it arrives so nothing shifts.
 */
export function NotificationBell({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={<span aria-hidden="true" className="size-11 shrink-0" />}
    >
      <FlaggedBell className={className} />
    </Suspense>
  );
}

function FlaggedBell({ className }: { className?: string }) {
  const enabled = useFlag("central_notificacoes");
  const unread = useNotificationsStore((state) => state.unread);
  const setOpen = useNotificationsStore((state) => state.setOpen);
  if (!enabled) return null;
  return (
    <IconButton
      label={bellLabel(unread)}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
      data-tip="sino"
      className={className}
    >
      <Bell />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-micro text-surface tabular-nums"
        >
          {unreadBadgeLabel(unread)}
        </span>
      ) : null}
    </IconButton>
  );
}
