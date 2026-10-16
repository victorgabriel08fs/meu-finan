import { ChartColumn, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { CategoryRanking } from "@/components/reports/category-ranking";
import { IncomeExpenseCard } from "@/components/reports/income-expense-card";
import { CompactMoney, KpiTile } from "@/components/reports/kpi-tile";
import {
  defaultSelectedMonth,
  incomeExpenseSummary,
  monthSavingsRate,
  parseReportPeriod,
  periodQuery,
  savingsCaption,
  sumTotals,
} from "@/components/reports/model";
import { NetWorthCard } from "@/components/reports/net-worth-card";
import { SavingsRateCard } from "@/components/reports/savings-rate-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { daysBetween, parse, periodDays } from "@/lib/finance";
import { formatBRL } from "@/lib/format/money";
import { formatPercent } from "@/lib/format/number";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import {
  categoryBreakdown,
  monthlySeries,
  netWorthSeries,
  savingsRateOf,
  trailingPeriods,
} from "@/server/domain/reports";

export const metadata: Metadata = { title: "Relatórios" };

export default function VisaoGeralPage({
  searchParams,
}: PageProps<"/relatorios/visao-geral">) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({
  searchParams,
}: {
  searchParams: PageProps<"/relatorios/visao-geral">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const period = parseReportPeriod((await searchParams).periodo);
  const range = resolvePeriod(ctx, null);
  const first = trailingPeriods(range, period)[0] ?? range;

  const [series, netWorth, breakdown] = await Promise.all([
    monthlySeries(ctx, range, period),
    // One month more: the change is measured from the end of the month before.
    netWorthSeries(ctx, range, period + 1),
    categoryBreakdown(ctx, first.start, range.end),
  ]);
  const savings = savingsRateOf(ctx, series);
  const totals = sumTotals(series);

  const hasEntries = series.some(
    (point) => point.incomeCents > 0 || point.expenseCents > 0,
  );
  if (!hasEntries && netWorth.every((point) => point.cents === 0)) {
    return (
      <EmptyState
        icon={<ChartColumn />}
        title="Ainda não há dados suficientes"
        description="Com alguns dias de registros, os gráficos aparecem aqui."
        action={
          <QuickAddButton kind="expense">Adicionar lançamento</QuickAddButton>
        }
      />
    );
  }

  const complete = series.filter((point) => !point.partial);
  const elapsed = daysBetween(parse(range.start), ctx.today) + 1;
  const partialProgress = `até o dia ${elapsed} de ${periodDays(range.period)}`;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <div className="grid grid-cols-2 gap-2 md:col-span-2 md:grid-cols-3 md:gap-4">
        <KpiTile
          label="Receitas"
          value={<CompactMoney cents={totals.incomeCents} />}
          support={totals.partialCaption}
        />
        <KpiTile
          label="Despesas"
          value={<CompactMoney cents={totals.expenseCents} />}
          support={totals.partialCaption}
        />
        <KpiTile
          className="col-span-2 md:col-span-1"
          label="Taxa de poupança"
          value={
            savings.rate === null ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">sem dados</span>
              </>
            ) : (
              formatPercent(savings.rate)
            )
          }
          support={savingsCaption(savings)}
        />
      </div>

      <div className="md:col-span-2">
        <IncomeExpenseCard
          key={period}
          months={series.map(
            ({ month, incomeCents, expenseCents, partial }) => ({
              month,
              incomeCents,
              expenseCents,
              partial,
            }),
          )}
          defaultSelected={defaultSelectedMonth(series)}
          summary={incomeExpenseSummary(series)}
          partialProgress={
            series.some((point) => point.partial) ? partialProgress : null
          }
        />
      </div>

      <SavingsRateCard
        months={complete.map((point) => point.month)}
        rates={complete.map((point) => monthSavingsRate(point))}
      />

      <NetWorthCard points={netWorth} period={period} />

      <Card asChild className="flex flex-col gap-1 md:col-span-2">
        <section aria-labelledby="relatorio-categorias">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 id="relatorio-categorias" className="text-headline text-fg">
              Para onde foi o dinheiro
            </h2>
            <span className="text-callout font-semibold text-fg-3 tabular-nums">
              <span data-privacy-value="">
                {formatBRL(breakdown.totalCents)}
              </span>
              <span data-privacy-mask="">R$ ••••</span>
            </span>
          </div>
          {breakdown.items.length === 0 ? (
            <p className="py-4 text-callout text-fg-2">
              Nenhuma despesa paga no período.
            </p>
          ) : (
            <CategoryRanking
              items={breakdown.items}
              month={range.month}
              limit={5}
            />
          )}
          <Button asChild variant="secondary" className="mt-2">
            <Link href={`/relatorios/categorias${periodQuery(period)}`}>
              Ver todas as categorias
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </Card>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <LoadingRegion className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <div className="grid grid-cols-2 gap-2 md:col-span-2 md:grid-cols-3 md:gap-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="col-span-2 h-24 rounded-card md:col-span-1" />
      </div>
      <Skeleton className="h-80 rounded-card md:col-span-2" />
      <Skeleton className="h-56 rounded-card" />
      <Skeleton className="h-36 rounded-card" />
      <Skeleton className="h-72 rounded-card md:col-span-2" />
    </LoadingRegion>
  );
}
