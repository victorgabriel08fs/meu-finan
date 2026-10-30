import {
  CalendarClock,
  CreditCard,
  Gauge,
  type LucideIcon,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InsetList, InsetListItem } from "@/components/app/inset-list";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import { PushSettings } from "@/components/push/push-settings";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { isFlagEnabled } from "@/server/flags";
import { vapidKeys } from "@/server/push";

export const metadata: Metadata = { title: "Notificações" };

/** What will arrive (doc 01 RF-14); each one lands in a later step. */
const COMING: { icon: LucideIcon; label: string; description: string }[] = [
  {
    icon: CalendarClock,
    label: "Contas a vencer",
    description: "Lançamentos agendados que vencem nos próximos 3 dias",
  },
  {
    icon: CreditCard,
    label: "Fatura fechando",
    description: "2 dias antes do fechamento, com o total até agora",
  },
  {
    icon: Gauge,
    label: "Orçamentos",
    description: "Quando uma categoria chega a 80% e a 100%",
  },
  {
    icon: Target,
    label: "Metas",
    description: "Quando você atinge uma meta",
  },
];

/**
 * Ajustes › Notificações (doc 02 §6.14), behind the notificacoes_push flag:
 * notifications on this device and the number on the app icon. The switch
 * is per device; the device itself knows whether it is on, so that part
 * renders in the browser.
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
  // Only the public half reaches the browser.
  const publicKey = vapidKeys()?.publicKey ?? null;

  return (
    <>
      <PushSettings publicKey={publicKey} isAdmin={user.role === "admin"} />
      <section aria-labelledby="notificacoes-avisos">
        <SectionHeader id="notificacoes-avisos" title="Avisos" />
        <InsetList aria-labelledby="notificacoes-avisos">
          {COMING.map(({ icon: Icon, label, description }) => (
            <InsetListItem
              key={label}
              icon={<Icon />}
              label={label}
              description={description}
              trailing={
                <span className="text-caption text-fg-3">Em breve</span>
              }
            />
          ))}
        </InsetList>
      </section>
    </>
  );
}

function NotificationsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      {/* Neste aparelho: 36 + 64 + the note below the card */}
      <Skeleton className="h-35 rounded-2xl" />
      {/* Avisos: 36 + 4 × 64 + 3 hairlines */}
      <Skeleton className="h-73.75 rounded-2xl" />
    </LoadingRegion>
  );
}
