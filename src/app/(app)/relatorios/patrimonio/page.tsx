import { CalendarOff, Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { noRecordsCopy } from "@/components/dashboard/block-no-records";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { parseReportPeriod } from "@/components/reports/model";
import { NetWorthReport } from "@/components/reports/net-worth-report";
import { ReportEndNote } from "@/components/reports/report-month";
import {
  clampReportMonth,
  parseMonthParam,
  periodViewHref,
} from "@/components/reports/views";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { isBeforeFirstRecord } from "@/lib/reports/coverage";
import { requireUser } from "@/server/dal";
import {
  getUserContext,
  periodMonthOf,
  resolvePeriod,
} from "@/server/domain/context";
import { netWorthBreakdown } from "@/server/domain/reports";
import { firstRecordOn } from "@/server/domain/request-reads";

export const metadata: Metadata = { title: "Relatórios · Patrimônio" };

export default function PatrimonioPage({
  searchParams,
}: PageProps<"/relatorios/patrimonio">) {
  return (
    <Suspense fallback={<NetWorthSkeleton />}>
      <NetWorth searchParams={searchParams} />
    </Suspense>
  );
}

async function NetWorth({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/patrimonio">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const { periodo, mes } = await searchParams;
  const period = parseReportPeriod(periodo);
  const currentMonth = resolvePeriod(ctx, null).month;
  const month = clampReportMonth(parseMonthParam(mes), currentMonth);
  const range = resolvePeriod(ctx, month);
  const note = (
    <ReportEndNote
      path="/relatorios/patrimonio"
      period={period}
      month={range.month}
      currentMonth={currentMonth}
    />
  );

  // A window that ended before the first record would project flat balances.
  const first = await firstRecordOn(ctx);
  if (first && isBeforeFirstRecord(range.end, first)) {
    const firstMonth = periodMonthOf(ctx, first);
    const copy = noRecordsCopy(range.month, firstMonth);
    return (
      <>
        {note}
        <EmptyState
          icon={<CalendarOff />}
          title={copy.title}
          description={copy.description}
          action={
            <Button asChild variant="tonal">
              <Link
                href={periodViewHref(
                  "/relatorios/patrimonio",
                  period,
                  firstMonth,
                  currentMonth,
                )}
              >
                {copy.actionLabel}
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  // One month more: the change is measured from the end of the month before.
  const points = await netWorthBreakdown(ctx, range, period + 1);

  if (
    points.every(
      (point) => point.assetsCents === 0 && point.liabilitiesCents === 0,
    )
  ) {
    return (
      <>
        {note}
        <EmptyState
          icon={<Landmark />}
          title="Ainda não há dados suficientes"
          description="Com alguns dias de registros, os gráficos aparecem aqui."
          action={
            <QuickAddButton kind="expense">Adicionar lançamento</QuickAddButton>
          }
        />
      </>
    );
  }

  return (
    <>
      {note}
      <NetWorthReport key={period} points={points} period={period} />
    </>
  );
}

function NetWorthSkeleton() {
  return (
    <LoadingRegion className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <Skeleton className="h-96 rounded-card md:col-span-2" />
      <Skeleton className="h-64 rounded-card" />
      <Skeleton className="h-64 rounded-card" />
      <Skeleton className="h-11 rounded-control md:w-56" />
    </LoadingRegion>
  );
}
