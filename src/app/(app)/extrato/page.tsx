import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoonButton } from "@/components/app/coming-soon-button";
import { EmptyState } from "@/components/app/empty-state";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { monthLabel, todayInTimeZone } from "@/lib/format/date";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Extrato" };

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function ExtratoPage({ searchParams }: PageProps<"/extrato">) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Extrato" />
      <Suspense fallback={<StatementSkeleton />}>
        <Statement searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Statement({
  searchParams,
}: {
  searchParams: PageProps<"/extrato">["searchParams"];
}) {
  await requireUser();
  const { mes } = await searchParams;
  const current = todayInTimeZone().slice(0, 7);
  const month =
    typeof mes === "string" && MONTH_PARAM.test(mes) ? mes : current;
  const monthName = monthLabel(month).split(" de ")[0];

  return (
    <>
      <MonthSwitcher
        month={month}
        currentMonth={current}
        hrefFor={(target) =>
          target === current ? "/extrato" : `/extrato?mes=${target}`
        }
      />
      <EmptyState
        icon={<ReceiptText />}
        title={`Nenhum lançamento em ${monthName}`}
        description="Registre seu primeiro gasto — leva 5 segundos."
        action={
          <ComingSoonButton message="Em breve: registrar lançamentos">
            Adicionar despesa
          </ComingSoonButton>
        }
      />
    </>
  );
}

function StatementSkeleton() {
  return (
    <LoadingRegion className="flex flex-col items-center gap-5">
      <Skeleton className="h-11 w-64 rounded-full" />
      <Skeleton className="h-80 w-full rounded-card" />
    </LoadingRegion>
  );
}
