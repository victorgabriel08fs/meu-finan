import { CalendarClock, CalendarOff, CircleSlash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { noRecordsCopy } from "@/components/dashboard/block-no-records";
import { InstallmentsEndingBlock } from "@/components/dashboard/installments-ending-block";
import { monthName } from "@/components/dashboard/labels";
import { MonthComparisonBlock } from "@/components/dashboard/month-comparison-block";
import { SubscriptionsBlock } from "@/components/dashboard/subscriptions-block";
import {
  ClosingBudgetsCard,
  ClosingNoBudgetsCard,
} from "@/components/reports/closing-budgets-card";
import { firstClosingCopy } from "@/components/reports/closing-model";
import { ClosingSummaryCard } from "@/components/reports/closing-summary-card";
import {
  ReportMonthSwitcher,
  ReportMonthSwitcherSkeleton,
} from "@/components/reports/report-month";
import { SaveLeftoverCard } from "@/components/reports/save-leftover-card";
import {
  categoryDetailHref,
  monthViewHref,
  parseMonthParam,
  periodViewHref,
} from "@/components/reports/views";
import {
  MAX_QUERY_LENGTH,
  statementHref,
} from "@/components/transactions/statement-params";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { isBeforeFirstRecord } from "@/lib/reports/coverage";
import { requireUser } from "@/server/dal";
import { getUserContext, periodMonthOf } from "@/server/domain/context";
import { closingRange, monthClosing } from "@/server/domain/month-closing";
import { MONTH_COMPARISON_MIN_DIFF_CENTS } from "@/server/domain/month-comparison";
import { firstRecordOn } from "@/server/domain/request-reads";

export const metadata: Metadata = { title: "Relatórios · Fechamento" };

const PATH = "/relatorios/fechamento";

export default function FechamentoPage({
  searchParams,
}: PageProps<"/relatorios/fechamento">) {
  return (
    <Suspense fallback={<ClosingSkeleton />}>
      <Closing searchParams={searchParams} />
    </Suspense>
  );
}

async function Closing({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/fechamento">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const { range, lastClosed, current } = closingRange(
    ctx,
    parseMonthParam((await searchParams).mes),
  );
  const first = await firstRecordOn(ctx);

  // No month has closed with records yet: nothing to switch between.
  if (!first || first >= current.start) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="O primeiro fechamento ainda não chegou"
        description={firstClosingCopy(current.end, current.month)}
        action={
          <Button asChild variant="tonal">
            <Link href="/relatorios/fluxo">
              Ver o Fluxo de {monthName(current.month)}
            </Link>
          </Button>
        }
      />
    );
  }

  const switcher = (
    <ReportMonthSwitcher
      path={PATH}
      month={range.month}
      currentMonth={lastClosed.month}
      maxMonth={lastClosed.month}
      currentLabel="Ver o último fechamento"
      start={range.start}
      end={range.end}
      showRange={ctx.monthStartDay !== 1}
    />
  );

  if (isBeforeFirstRecord(range.end, first)) {
    const firstMonth = periodMonthOf(ctx, first);
    const copy = noRecordsCopy(range.month, firstMonth);
    return (
      <>
        {switcher}
        <EmptyState
          icon={<CalendarOff />}
          title={copy.title}
          description={copy.description}
          action={
            <Button asChild variant="tonal">
              <Link href={monthViewHref(PATH, firstMonth, lastClosed.month)}>
                {copy.actionLabel}
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const closing = await monthClosing(ctx, range);
  if (!closing) return null;
  const month = monthName(closing.month);
  const currentMonthName = monthName(closing.currentMonth);
  const statement = (status: "pending" | null) =>
    statementHref(
      {
        month: closing.month,
        accountId: null,
        categoryId: null,
        tagId: null,
        kind: null,
        status,
        q: "",
      },
      closing.currentMonth,
    );

  if (closing.incomeCents === 0 && closing.expenseCents === 0) {
    return (
      <>
        {switcher}
        <EmptyState
          icon={<CircleSlash />}
          title={`Nada pago em ${month}`}
          description="Sem receitas nem despesas pagas neste mês."
          action={
            <Button asChild variant="tonal">
              <Link href={statement(null)}>Ver o extrato de {month}</Link>
            </Button>
          }
        />
      </>
    );
  }

  const { comparison, budgets, next } = closing;
  const showComparison =
    comparison !== null &&
    (comparison.total.currentCents !== 0 ||
      comparison.total.baselineCents !== 0);
  const hrefStatement = (item: {
    nextOn: string;
    accountId: string;
    description: string;
  }) =>
    statementHref(
      {
        month: periodMonthOf(ctx, item.nextOn),
        accountId: item.accountId,
        categoryId: null,
        tagId: null,
        kind: "expense",
        status: "pending",
        q: item.description.slice(0, MAX_QUERY_LENGTH),
      },
      closing.currentMonth,
    );

  return (
    <>
      {switcher}
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-2">
        <ClosingSummaryCard
          monthName={month}
          previousMonthName={monthName(closing.previousMonth)}
          incomeCents={closing.incomeCents}
          expenseCents={closing.expenseCents}
          leftCents={closing.leftCents}
          previousLeftCents={closing.previous?.leftCents ?? null}
          hasPending={closing.hasPending}
          pendingHref={statement("pending")}
        />

        {next && closing.leftCents > 0 ? (
          <SaveLeftoverCard
            monthName={month}
            start={closing.start}
            leftCents={closing.leftCents}
            savedCents={next.savings.savedCents}
            boxes={next.savings.boxes}
            spendableId={next.savings.spendableId}
          />
        ) : null}

        {budgets ? (
          <ClosingBudgetsCard
            monthName={month}
            currentMonthName={currentMonthName}
            currentMonth={closing.currentMonth}
            month={closing.month}
            metCount={budgets.metCount}
            over={budgets.over}
            latest={closing.latest}
          />
        ) : closing.latest ? (
          <ClosingNoBudgetsCard monthName={month} />
        ) : null}

        {comparison && showComparison ? (
          <MonthComparisonBlock
            comparison={comparison}
            monthName={monthName(comparison.month)}
            previousMonthName={monthName(comparison.previousMonth)}
            reportHref={periodViewHref(
              "/relatorios/categorias",
              1,
              closing.month,
              closing.currentMonth,
            )}
            hrefFor={(categoryId) =>
              categoryDetailHref(
                categoryId,
                1,
                closing.month,
                closing.currentMonth,
              )
            }
            minDiffCents={MONTH_COMPARISON_MIN_DIFF_CENTS}
          />
        ) : null}

        {next && next.subscriptions.items.length > 0 ? (
          <SubscriptionsBlock
            summary={next.subscriptions}
            today={ctx.todayIso}
            hrefFor={hrefStatement}
          />
        ) : null}

        {next && next.installments.items.length > 0 ? (
          <InstallmentsEndingBlock
            summary={next.installments}
            hrefFor={hrefStatement}
          />
        ) : null}
      </div>
    </>
  );
}

function ClosingSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <ReportMonthSwitcherSkeleton />
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-card lg:col-span-2" />
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </LoadingRegion>
  );
}
