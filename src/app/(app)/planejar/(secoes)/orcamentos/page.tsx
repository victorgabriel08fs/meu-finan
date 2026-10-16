import type { Metadata } from "next";
import { Suspense } from "react";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { monthName } from "@/components/charts/format";
import {
  BudgetsView,
  type BudgetsViewProps,
} from "@/components/planning/budgets/budgets-view";
import {
  type MonthTiming,
  suggestBudgets,
} from "@/components/planning/budgets/model";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { periodLabel } from "@/lib/format/date";
import { requireUser } from "@/server/dal";
import { getBudgets } from "@/server/domain/budgets";
import { listCategories } from "@/server/domain/categories";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { categoryBreakdown, trailingPeriods } from "@/server/domain/reports";

export const metadata: Metadata = { title: "Orçamentos" };

/** Months of history behind the averages and the suggestion. */
const HISTORY_MONTHS = 3;

export default function OrcamentosPage({
  searchParams,
}: PageProps<"/planejar/orcamentos">) {
  return (
    <Suspense fallback={<BudgetsSkeleton />}>
      <Budgets searchParams={searchParams} />
    </Suspense>
  );
}

async function Budgets({
  searchParams,
}: {
  searchParams: PageProps<"/planejar/orcamentos">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const params = await searchParams;
  const range = resolvePeriod(
    ctx,
    typeof params.mes === "string" ? params.mes : null,
  );
  const current = resolvePeriod(ctx, null);
  // [m−3, m−2, m−1, m]: the history and the month on screen.
  const periods = trailingPeriods(range, HISTORY_MONTHS + 1);
  const first = periods[0] ?? range;
  const previous = periods[HISTORY_MONTHS - 1] ?? range;

  const [overview, previousOverview, categories, history] = await Promise.all([
    getBudgets(ctx, range),
    getBudgets(ctx, previous),
    listCategories(user.id, "expense"),
    categoryBreakdown(ctx, first.start, previous.end),
  ]);

  const active = new Map(categories.map((category) => [category.id, category]));
  const budgeted = new Set(overview.items.map((item) => item.categoryId));
  const averages: Record<string, number> = {};
  for (const item of history.items) {
    if (item.categoryId && active.has(item.categoryId)) {
      averages[item.categoryId] = Math.round(item.cents / HISTORY_MONTHS);
    }
  }

  let timing: MonthTiming = "current";
  if (range.end < ctx.todayIso) timing = "past";
  else if (range.start > ctx.todayIso) timing = "future";

  const props: BudgetsViewProps = {
    month: range.month,
    monthName: monthName(range.month),
    previousMonthName: monthName(previous.month),
    timing,
    items: overview.items,
    total: overview.total,
    unbudgeted: categories
      .filter((category) => !budgeted.has(category.id))
      .map(({ id, name, icon, color }) => ({ id, name, icon, color }))
      .sort(
        (a, b) =>
          (averages[b.id] ?? 0) - (averages[a.id] ?? 0) ||
          a.name.localeCompare(b.name, "pt-BR"),
      ),
    averages,
    copyable: previousOverview.items.filter(
      (item) => !budgeted.has(item.categoryId) && active.has(item.categoryId),
    ).length,
    suggestions: suggestBudgets(
      categories.map((category) => ({
        categoryId: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        averageCents: averages[category.id] ?? 0,
      })),
      budgeted,
    ),
  };

  return (
    <>
      <div className="flex flex-col items-center">
        <MonthSwitcher
          month={range.month}
          currentMonth={current.month}
          hrefFor={(month) => `/planejar/orcamentos?mes=${month}`}
        />
        {ctx.monthStartDay === 1 ? null : (
          // doc 02 §4.3: with a start day other than 1, show the interval.
          <p className="text-caption text-fg-3">
            {periodLabel(range.start, range.end)}
          </p>
        )}
      </div>
      <BudgetsView {...props} />
    </>
  );
}

function BudgetsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-5">
      <Skeleton className="mx-auto h-11 w-64 rounded-full" />
      <Skeleton className="h-64 rounded-card" />
      <Skeleton className="h-4 w-28 rounded-badge" />
      <Skeleton className="h-80 rounded-card" />
    </LoadingRegion>
  );
}
