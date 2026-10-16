import { ChartLine, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { CashFlowCard } from "@/components/reports/cash-flow-card";
import {
  type LowestTone,
  lowestTone,
} from "@/components/reports/cash-flow-model";
import { CompactMoney, KpiTile } from "@/components/reports/kpi-tile";
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
import { type CashFlowReport, cashFlowReport } from "@/server/domain/reports";
import { RECURRENCE_HORIZON_DAYS } from "@/server/domain/transactions";

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

  const nothing =
    report.paidCount === 0 &&
    report.scheduled.length === 0 &&
    report.days.every(
      (day) =>
        (day.realizedCents ?? 0) === 0 && (day.projectedCents ?? 0) === 0,
    );
  if (!report.hasAccounts || nothing) {
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
  const today = report.days.find((day) => day.date === ctx.todayIso);
  const low =
    report.phase === "past" ? report.lowestRealized : report.lowestProjected;
  const tone = lowestTone(report);
  const projects = report.phase !== "past";

  return (
    <>
      {switcher}
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:col-span-3">
          {report.phase === "current" ? (
            <KpiTile
              label="Saldo hoje"
              value={<CompactMoney cents={today?.realizedCents ?? 0} />}
              support="em contas, sem cartões"
            />
          ) : report.phase === "past" ? (
            <KpiTile
              label={`Saldo em ${endLabel}`}
              value={<CompactMoney cents={report.endCents} />}
              support="no fim do mês"
            />
          ) : (
            <KpiTile
              label={`Previsto em ${shortDateLabel(range.start)}`}
              value={<CompactMoney cents={report.startCents} />}
              support="no início do mês"
            />
          )}
          {report.phase === "past" ? (
            <KpiTile
              label="Variação no mês"
              value={
                <CompactMoney
                  cents={report.endCents - report.startCents}
                  sign="always"
                />
              }
              support={`de ${shortDateLabel(range.start)} a ${endLabel}`}
            />
          ) : (
            <KpiTile
              label={`Previsto para ${endLabel}`}
              value={<CompactMoney cents={report.endCents} />}
              support="com os agendados e as faturas"
            />
          )}
          <KpiTile
            className="col-span-2 md:col-span-1"
            label={projects ? "Menor saldo previsto" : "Menor saldo"}
            value={<CompactMoney cents={low?.cents ?? report.endCents} />}
            support={low ? <LowSupport date={low.date} tone={tone} /> : null}
          />
        </div>

        <div className={cn(projects ? "lg:col-span-2" : "lg:col-span-3")}>
          <CashFlowCard
            key={range.month}
            report={report}
            today={ctx.todayIso}
            note={futureNote(report)}
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

/** "em 25/out", or "negativo em 25/out" with an icon in the status tone. */
function LowSupport({ date, tone }: { date: string; tone: LowestTone }) {
  if (!tone) return <>em {shortDateLabel(date)}</>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bold",
        tone === "danger" ? "text-danger" : "text-warning",
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      negativo em {shortDateLabel(date)}
    </span>
  );
}

/** A month ahead only knows what is already scheduled. */
function futureNote(report: CashFlowReport): string | undefined {
  if (report.phase !== "future") return undefined;
  return `Só entra o que já está agendado; repetições aparecem até ${RECURRENCE_HORIZON_DAYS} dias à frente.`;
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
