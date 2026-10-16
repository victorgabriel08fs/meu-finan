import type { Metadata } from "next";
import { Suspense } from "react";
import { CompoundSimulator } from "@/components/planning/simulator/simulator";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toYearMonth } from "@/lib/finance";
import { requireUser } from "@/server/dal";
import { getUserContext } from "@/server/domain/context";
import { getMarketRates } from "@/server/domain/rates";

export const metadata: Metadata = { title: "Simulador" };

export default function SimuladorPage() {
  return (
    <Suspense fallback={<SimulatorSkeleton />}>
      <Simulator />
    </Suspense>
  );
}

async function Simulator() {
  const user = await requireUser();
  // Everything after this runs in the browser: the rates travel with the page.
  const [ctx, market] = await Promise.all([
    getUserContext(user.id),
    getMarketRates(),
  ]);
  return <CompoundSimulator market={market} today={toYearMonth(ctx.today)} />;
}

function SimulatorSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4 lg:grid lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:gap-x-6">
      <Skeleton className="h-10 rounded-full lg:col-start-1" />
      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Skeleton className="h-60 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
      <Skeleton className="h-125 rounded-card lg:col-start-1 lg:row-start-2" />
    </LoadingRegion>
  );
}
