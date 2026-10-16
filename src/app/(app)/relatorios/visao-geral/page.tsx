import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoonButton } from "@/components/app/coming-soon-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Relatórios" };

export default function VisaoGeralPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Relatórios" />
      <Suspense
        fallback={
          <LoadingRegion>
            <Skeleton className="h-80 rounded-card" />
          </LoadingRegion>
        }
      >
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  await requireUser();
  return (
    <EmptyState
      icon={<ChartColumn />}
      title="Ainda não há dados suficientes"
      description="Com alguns dias de registros, os gráficos aparecem aqui."
      action={
        <ComingSoonButton message="Em breve: registrar lançamentos">
          Adicionar lançamento
        </ComingSoonButton>
      }
    />
  );
}
