import type { Metadata } from "next";
import { Suspense } from "react";
import { MonthSwitcher, shiftMonth } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import {
  type StatementItem,
  summarize,
} from "@/components/transactions/statement-data";
import {
  type FilterAccount,
  type FilterCategory,
  StatementFilterBar,
} from "@/components/transactions/statement-filters";
import { StatementList } from "@/components/transactions/statement-list";
import {
  hasActiveFilters,
  parseStatementParams,
  type StatementFilters,
  statementCategoryIds,
  statementHref,
} from "@/components/transactions/statement-params";
import { StatementSearch } from "@/components/transactions/statement-search";
import { StatementSummaryCard } from "@/components/transactions/statement-summary";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { monthLabel, periodLabel } from "@/lib/format/date";
import { requireUser } from "@/server/dal";
import { ACCOUNT_TYPE_LABELS, listAccounts } from "@/server/domain/accounts";
import { listCategoriesForAdmin } from "@/server/domain/category-admin";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { pendingNonBusinessDue } from "@/server/domain/holidays";
import { transactionShares } from "@/server/domain/sharing/expenses";
import { listShareTargets } from "@/server/domain/sharing/groups";
import {
  listTransactions,
  periodTotals,
  type TransactionListItem,
} from "@/server/domain/transactions";
import { getFlags } from "@/server/flags";

export const metadata: Metadata = { title: "Extrato" };

/**
 * Extrato (doc 02 §6.4). URL state: `mes` (YYYY-MM), `conta`, `categoria`
 * (its subcategories included), `tipo` (receita | despesa | transferencia),
 * `status` (pendente | pago) and `q`. The title prerenders; the search reads
 * the URL on the client; the list streams in behind its skeleton. Filter and
 * search updates flag `data-pending`, which dims the list (the `group`
 * below) until it reloads.
 */
export default function ExtratoPage({ searchParams }: PageProps<"/extrato">) {
  return (
    <div className="group flex flex-col gap-4">
      <PageHeader title="Extrato" />
      <Suspense fallback={<Skeleton className="h-11 w-full" />}>
        <StatementSearch />
      </Suspense>
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
  const user = await requireUser();
  const ctx = await getUserContext(user.id);
  const parsed = parseStatementParams(await searchParams);
  const range = resolvePeriod(ctx, parsed.month);
  const currentMonth = resolvePeriod(ctx, null).month;

  const [accounts, categories] = await Promise.all([
    listAccounts(ctx.userId, { includeArchived: true }),
    // Archived ones too: the filter of a parent brings its archived
    // subcategories, and a link to an archived category still filters.
    listCategoriesForAdmin(ctx.userId),
  ]);
  // Ids from the URL count only when they are the user's own.
  const accountId = accounts.some((item) => item.id === parsed.accountId)
    ? parsed.accountId
    : null;
  const categoryId = categories.some((item) => item.id === parsed.categoryId)
    ? parsed.categoryId
    : null;
  const filters: StatementFilters = {
    ...parsed,
    month: range.month,
    accountId,
    categoryId,
  };
  // periodTotals filters by account only; any other filter sums the list.
  const totalsFromList = Boolean(
    categoryId || filters.kind || filters.status || filters.q,
  );

  const [list, totals, flags] = await Promise.all([
    listTransactions(ctx, {
      start: range.start,
      end: range.end,
      accountId: accountId ?? undefined,
      categoryIds: categoryId
        ? statementCategoryIds(categories, categoryId)
        : undefined,
      kind: filters.kind ?? undefined,
      status: filters.status ?? undefined,
      q: filters.q || undefined,
    }),
    totalsFromList
      ? null
      : periodTotals(ctx, range.start, range.end, accountId ?? undefined),
    getFlags(ctx.userId),
  ]);
  // "Dividir" and "Dividida em Casa" (financas_compartilhadas): the groups
  // the person is in, read only with the flag on.
  const [annotated, sharing] = await Promise.all([
    flags.alerta_dia_nao_util
      ? withNonBusinessDue(list.items, ctx.todayIso)
      : list.items,
    flags.financas_compartilhadas
      ? Promise.all([
          listShareTargets(ctx.userId),
          transactionShares(
            ctx.userId,
            list.items
              .filter((item) => item.kind === "expense")
              .map((item) => item.id),
          ),
        ])
      : null,
  ]);
  const items: StatementItem[] = sharing
    ? annotated.map((item) => ({
        ...item,
        sharedIn: sharing[1].get(item.id) ?? null,
      }))
    : annotated;

  const summary = totals
    ? { ...totals, transferCents: 0 }
    : summarize(list.items);
  const monthName = monthLabel(range.month).replace(/ de \d+$/, "");
  const previous = shiftMonth(range.month, -1);
  const hrefFor = (month: string) =>
    statementHref({ ...filters, month }, currentMonth);

  const filterAccounts: FilterAccount[] = accounts.map((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    color: item.color,
    typeLabel: ACCOUNT_TYPE_LABELS[item.type],
    archived: item.archived,
  }));
  const filterCategories: FilterCategory[] = categories.map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    icon: item.icon,
    color: item.color,
    parentId: item.parentId,
    archived: item.archived,
  }));

  return (
    <>
      <div className="flex flex-col items-center gap-0.5">
        <MonthSwitcher
          month={range.month}
          currentMonth={currentMonth}
          hrefFor={hrefFor}
        />
        {ctx.monthStartDay === 1 ? null : (
          <p className="text-caption text-fg-3">
            {periodLabel(range.start, range.end)}
          </p>
        )}
      </div>

      <StatementFilterBar
        accounts={filterAccounts}
        categories={filterCategories}
      />

      <div className="flex flex-col gap-4 transition-opacity duration-150 group-has-data-pending:opacity-60">
        {list.items.length > 0 ? (
          <StatementSummaryCard
            summary={summary}
            monthName={monthName}
            mode={
              filters.kind === "transfer"
                ? "transfer"
                : filters.status === "pending"
                  ? "pending"
                  : "flow"
            }
          />
        ) : null}
        <StatementList
          items={items}
          hasMore={list.hasMore}
          today={ctx.todayIso}
          monthName={monthName}
          previousMonth={{
            href: hrefFor(previous),
            name: monthLabel(previous).replace(/ de \d+$/, ""),
          }}
          filtered={hasActiveFilters(filters)}
          query={filters.q}
          categories={filterCategories}
          sharing={sharing ? sharing[0] : null}
        />
      </div>
    </>
  );
}

/**
 * Pending expenses outside the cards due on a non-business day get the note
 * (flag alerta_dia_nao_util), while it still matters: due today or ahead, or
 * in the grace days up to the next business day.
 */
async function withNonBusinessDue(
  items: TransactionListItem[],
  today: string,
): Promise<StatementItem[]> {
  const isBill = (item: TransactionListItem) =>
    item.status === "pending" &&
    item.kind === "expense" &&
    item.accountType !== "credit_card";
  const found = await pendingNonBusinessDue(
    items.filter(isBill).map((item) => item.occurredOn),
    today,
  );
  if (found.size === 0) return items;
  return items.map((item) =>
    isBill(item) && found.has(item.occurredOn)
      ? { ...item, nonBusinessDue: found.get(item.occurredOn) }
      : item,
  );
}

/** Same shapes and heights as the loaded statement (§5.17, zero CLS). */
function StatementSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <Skeleton className="mx-auto h-11 w-64 rounded-full" />
      <div className="flex gap-2 overflow-hidden py-1">
        <Skeleton className="h-9 w-24 shrink-0 rounded-full" />
        <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
        <Skeleton className="h-9 w-18 shrink-0 rounded-full" />
        <Skeleton className="h-9 w-26 shrink-0 rounded-full" />
      </div>
      <Skeleton className="h-19 w-full rounded-card" />
      <div className="flex flex-col gap-0">
        <Skeleton className="my-3 h-4 w-36 rounded-badge" />
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="mt-6 mb-3 h-4 w-28 rounded-badge" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    </LoadingRegion>
  );
}
