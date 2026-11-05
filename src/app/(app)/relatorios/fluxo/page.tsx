import { ChartLine } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { CashFlowCard } from "@/components/reports/cash-flow-card";
import {
  CashFlowKpiTiles,
  cashFlowFutureNote,
} from "@/components/reports/cash-flow-kpis";
import { isCashFlowEmpty } from "@/components/reports/cash-flow-model";
import {
  ReportMonthSwitcher,
  ReportMonthSwitcherSkeleton,
} from "@/components/reports/report-month";
import { ScheduledList } from "@/components/reports/scheduled-list";
import { parseMonthParam } from "@/components/reports/views";
import { statementHref } from "@/components/transactions/statement-params";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { shortDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { cashFlowReport } from "@/server/domain/reports";

export const metadata: Metadata = { title: "Relatórios · Fluxo de caixa" };

export default function FluxoPage({
  searchParams,
}: PageProps<"/relatorios/fluxo">) {
  return (
    <Suspense fallback={<CashFlowSkeleton />}>
      <CashFlow searchParams={searchParams} />
    </Suspense>
  );
}

async function CashFlow({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/fluxo">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const range = resolvePeriod(ctx, parseMonthParam((await searchParams).mes));
  const currentMonth = resolvePeriod(ctx, null).month;
  const report = await cashFlowReport(ctx, range);

  const switcher = (
    <ReportMonthSwitcher
      path="/relatorios/fluxo"
      month={range.month}
      currentMonth={currentMonth}
      start={range.start}
      end={range.end}
      showRange={ctx.monthStartDay !== 1}
    />
  );

  if (!report.hasAccounts || isCashFlowEmpty(report)) {
    return (
      <>
        {switcher}
        <EmptyState
          icon={<ChartLine />}
          title="Ainda não há dados suficientes"
          description="Com alguns dias de registros, os gráficos aparecem aqui."
          action={
            <QuickAddButton kind="expense">Adicionar lançamento</QuickAddButton>
          }
        />
      </>
    );
  }

  const endLabel = shortDateLabel(range.end);
  const projects = report.phase !== "past";

  return (
    <>
      {switcher}
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:col-span-3">
          <CashFlowKpiTiles
            report={report}
            start={range.start}
            end={range.end}
            today={ctx.todayIso}
            lastTileClassName="col-span-2 md:col-span-1"
          />
        </div>

        <div className={cn(projects ? "lg:col-span-2" : "lg:col-span-3")}>
          <CashFlowCard
            key={range.month}
            report={report}
            today={ctx.todayIso}
            note={cashFlowFutureNote(report)}
          />
        </div>

        {projects ? (
          <ScheduledList
            items={report.scheduled}
            endLabel={endLabel}
            statementHref={statementHref(
              {
                month: range.month,
                accountId: null,
                categoryId: null,
                kind: null,
                status: "pending",
                q: "",
              },
              currentMonth,
            )}
          />
        ) : null}
      </div>
    </>
  );
}

function CashFlowSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <ReportMonthSwitcherSkeleton />
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:col-span-3">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="col-span-2 h-24 rounded-card md:col-span-1" />
        </div>
        <Skeleton className="h-96 rounded-card lg:col-span-2" />
        <Skeleton className="h-80 rounded-card" />
      </div>
    </LoadingRegion>
  );
}
