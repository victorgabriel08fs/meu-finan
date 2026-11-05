import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PushSettings } from "@/components/push/push-settings";
import { ReminderSettings } from "@/components/push/reminder-settings";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { getNotificationPreferences } from "@/server/domain/preferences";
import { countPushDevices } from "@/server/domain/push";
import { isFlagEnabled } from "@/server/flags";
import { vapidKeys } from "@/server/push";

export const metadata: Metadata = { title: "Notificações" };

/**
 * Ajustes › Notificações (doc 02 §6.14), behind the notificacoes_push flag:
 * notifications on this device and the number on the app icon, then the
 * notices of the daily job and whether they show amounts. The device switch
 * is per device (the browser knows its state, so it renders there); the
 * notices are per person, for every device.
 */
export default function NotificacoesPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Notificações"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<NotificationsSkeleton />}>
        <Notifications />
      </Suspense>
    </div>
  );
}

async function Notifications() {
  const user = await requireUser();
  if (!(await isFlagEnabled("notificacoes_push", user.id))) notFound();
  const [ctx, preferences, devices] = await Promise.all([
    getUserContext(user.id),
    getNotificationPreferences(user.id),
    countPushDevices(user.id),
  ]);
  // Only the public half reaches the browser.
  const publicKey = vapidKeys()?.publicKey ?? null;

  return (
    <>
      <PushSettings publicKey={publicKey} isAdmin={user.role === "admin"} />
      <ReminderSettings
        initial={preferences}
        monthStartDay={ctx.monthStartDay}
        devices={devices}
      />
    </>
  );
}

function NotificationsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      {/* Neste aparelho: 36 + 64 + the note below the card */}
      <Skeleton className="h-35 rounded-2xl" />
      {/* Avisos: 36 + 5 rows, the lead time of Contas a vencer (on by
          default) and the note: between 360 and 430 px, and the desktop */}
      <Skeleton className="h-136 rounded-2xl sm:h-117" />
      {/* Privacidade: 36 + one row with a long hint */}
      <Skeleton className="h-37 rounded-2xl sm:h-25" />
    </LoadingRegion>
  );
}
