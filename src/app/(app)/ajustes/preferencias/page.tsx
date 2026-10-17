import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TipsPreferences } from "@/components/tips/tips-preferences";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { isoMonth, toYearMonth } from "@/lib/finance";
import { requireUser } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { getTipsOff } from "@/server/domain/tips";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Preferências" };

export default function PreferenciasPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Preferências"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<PreferencesSkeleton />}>
        <Preferences />
      </Suspense>
    </div>
  );
}

async function Preferences() {
  const user = await requireUser();
  const [ctx, tipsOff] = await Promise.all([
    getUserContext(user.id),
    getTipsOff(user.id),
  ]);
  return (
    <>
      <PreferencesForm
        monthStartDay={ctx.monthStartDay}
        currentMonth={isoMonth(toYearMonth(ctx.today))}
      />
      <TipsPreferences initiallyOff={tipsOff} />
    </>
  );
}

function PreferencesSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </LoadingRegion>
  );
}
