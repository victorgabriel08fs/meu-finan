import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { monthName } from "@/components/charts/format";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import {
  calendarStats,
  daysWithoutLabel,
  parseDayParam,
} from "@/components/reports/calendar-model";
import {
  DayExpenses,
  DayExpensesHint,
} from "@/components/reports/day-expenses";
import { CompactMoney, KpiTile } from "@/components/reports/kpi-tile";
import {
  ReportMonthSwitcher,
  ReportMonthSwitcherSkeleton,
} from "@/components/reports/report-month";
import { SpendingCalendar } from "@/components/reports/spending-calendar";
import { parseMonthParam } from "@/components/reports/views";
import { statementHref } from "@/components/transactions/statement-params";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { monthLabel, shortDateLabel } from "@/lib/format/date";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { dailySpending, reportPhase } from "@/server/domain/reports";
import { listTransactions } from "@/server/domain/transactions";

export const metadata: Metadata = { title: "Relatórios · Calendário" };

export default function CalendarioPage({
  searchParams,
}: PageProps<"/relatorios/calendario">) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/calendario">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const params = await searchParams;
  const range = resolvePeriod(ctx, parseMonthParam(params.mes));
  const currentMonth = resolvePeriod(ctx, null).month;
  const day = parseDayParam(params.dia, range);

  const [days, list] = await Promise.all([
    dailySpending(ctx, range),
    day
      ? listTransactions(ctx, { start: day, end: day, kind: "expense" })
      : null,
  ]);

  const switcher = (
    <ReportMonthSwitcher
      path="/relatorios/calendario"
      month={range.month}
      currentMonth={currentMonth}
      start={range.start}
      end={range.end}
      showRange={ctx.monthStartDay !== 1}
    />
  );

  if (days.every((item) => item.paidCount === 0 && item.pendingCount === 0)) {
    return (
      <>
        {switcher}
        <EmptyState
          icon={<CalendarDays />}
          title={`Nenhuma despesa em ${monthName(range.month)}`}
          description="Com seus gastos registrados, o calendário mostra os dias de mais movimento."
          action={
            <QuickAddButton kind="expense">Adicionar despesa</QuickAddButton>
          }
        />
      </>
    );
  }

  const phase = reportPhase(ctx, range);
  const stats = calendarStats(days, ctx.todayIso);
  const expensesHref = statementHref(
    {
      month: range.month,
      accountId: null,
      categoryId: null,
      kind: "expense",
      status: null,
      q: "",
    },
    currentMonth,
  );

  return (
    <>
      {switcher}
      {phase === "future" ? null : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
          <KpiTile
            label="Gasto no mês"
            value={<CompactMoney cents={stats.totalCents} />}
            support={
              phase === "past"
                ? "mês completo"
                : `em ${stats.elapsedDays} ${stats.elapsedDays === 1 ? "dia" : "dias"}`
            }
          />
          <KpiTile
            label="Média por dia"
            value={<CompactMoney cents={stats.averageCents ?? 0} />}
            support={daysWithoutLabel(stats.daysWithout)}
          />
          <KpiTile
            className="col-span-2 md:col-span-1"
            label="Dia mais caro"
            value={stats.top ? shortDateLabel(stats.top.date) : "—"}
            support={
              stats.top ? (
                <CompactMoney cents={stats.top.cents} />
              ) : (
                "sem gastos pagos"
              )
            }
          />
        </div>
      )}
      <div className="group grid grid-cols-1 items-start gap-3 md:gap-4 lg:grid-cols-2">
        <SpendingCalendar
          key={range.month}
          days={days}
          today={ctx.todayIso}
          monthTitle={monthLabel(range.month)}
        />
        {day && list ? (
          <DayExpenses
            date={day}
            items={list.items}
            hasMore={list.hasMore}
            today={ctx.todayIso}
            statementHref={expensesHref}
          />
        ) : (
          <DayExpensesHint />
        )}
      </div>
    </>
  );
}

function CalendarSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <ReportMonthSwitcherSkeleton />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="col-span-2 h-24 rounded-card md:col-span-1" />
      </div>
      <div className="grid grid-cols-1 items-start gap-3 md:gap-4 lg:grid-cols-2">
        <Skeleton className="h-112 rounded-card" />
        <Skeleton className="h-14 rounded-card" />
      </div>
    </LoadingRegion>
  );
}
