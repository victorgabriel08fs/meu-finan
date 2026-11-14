// Blocks of the Início (doc 02 §6.3), one async Server Component per id of
// the catalog (src/lib/home/blocks.ts). Each one reads only its own data and
// streams inside its own <Suspense> (HomeBlockFrame).
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/app/section-header";
import { StatTile } from "@/components/app/stat-tile";
import { AccountsCarousel } from "@/components/dashboard/accounts-carousel";
import { BalanceHero } from "@/components/dashboard/balance-hero";
import { BlockNoRecords } from "@/components/dashboard/block-no-records";
import { BudgetCard, BudgetInvite } from "@/components/dashboard/budget-card";
import {
  CashFlowBlock,
  CashFlowInvite,
  CashFlowNoAccountsInvite,
} from "@/components/dashboard/cash-flow-block";
import {
  CategoryBreakdownBlock,
  CategoryBreakdownInvite,
} from "@/components/dashboard/category-breakdown-block";
import { GoalsCard, GoalsInvite } from "@/components/dashboard/goals-card";
import {
  INCOME_EXPENSE_BLOCK_MONTHS,
  IncomeExpenseBlock,
  IncomeExpenseInvite,
} from "@/components/dashboard/income-expense-block";
import { InsightCard } from "@/components/dashboard/insight-card";
import {
  InstallmentsEndingBlock,
  InstallmentsEndingInvite,
} from "@/components/dashboard/installments-ending-block";
import { monthName } from "@/components/dashboard/labels";
import {
  MonthComparisonBlock,
  MonthComparisonFutureInvite,
  MonthComparisonInvite,
} from "@/components/dashboard/month-comparison-block";
import {
  NET_WORTH_BLOCK_POINTS,
  NetWorthBlock,
  NetWorthInvite,
} from "@/components/dashboard/net-worth-block";
import {
  SpendablePerDayBlock,
  SpendablePerDayNoAccountsInvite,
} from "@/components/dashboard/spendable-per-day-block";
import {
  SpendingCalendarBlock,
  SpendingCalendarInvite,
} from "@/components/dashboard/spending-calendar-block";
import {
  SubscriptionsBlock,
  SubscriptionsInvite,
} from "@/components/dashboard/subscriptions-block";
import {
  TopExpensesBlock,
  TopExpensesInvite,
} from "@/components/dashboard/top-expenses-block";
import { UpcomingBills } from "@/components/dashboard/upcoming-bills";
import { Money } from "@/components/money/money";
import { isCashFlowEmpty } from "@/components/reports/cash-flow-model";
import { partialProgress } from "@/components/reports/model";
import {
  categoryDetailHref,
  monthViewHref,
  periodViewHref,
} from "@/components/reports/views";
import { SharedBlock } from "@/components/sharing/shared-block";
import {
  MAX_QUERY_LENGTH,
  statementHref,
} from "@/components/transactions/statement-params";
import { monthLabel, shortDateLabel } from "@/lib/format/date";
import type { HomeBlockId } from "@/lib/home/blocks";
import { isBeforeFirstRecord, trimToFirstRecord } from "@/lib/reports/coverage";
import { getBudgets } from "@/server/domain/budgets";
import {
  type PeriodRange,
  periodMonthOf,
  resolvePeriod,
  type UserContext,
} from "@/server/domain/context";
import {
  biggestExpenses,
  categoryInsight,
  getAccountsStrip,
  getBalanceSummary,
  getSpendablePerDay,
  getUpcoming,
  installmentsEnding,
  withNonBusinessDue,
} from "@/server/domain/dashboard";
import { listGoals } from "@/server/domain/goals";
import {
  MONTH_COMPARISON_MIN_DIFF_CENTS,
  monthComparison,
} from "@/server/domain/month-comparison";
import {
  cashFlowReport,
  categoryBreakdown,
  dailySpending,
  monthlySeries,
  netWorthSeries,
  reportPhase,
} from "@/server/domain/reports";
import { firstRecordOn } from "@/server/domain/request-reads";
import { listMyGroups } from "@/server/domain/sharing/groups";
import { monthlySubscriptions } from "@/server/domain/subscriptions";
import { periodTotals } from "@/server/domain/transactions";
import { isFlagEnabled } from "@/server/flags";

type HomeBlockProps = {
  ctx: UserContext;
  /** The period of ?mes=, the same for every block. */
  range: PeriodRange;
};

/** The loader of every block of the catalog. */
export const HOME_BLOCK_LOADERS: Record<
  HomeBlockId,
  (props: HomeBlockProps) => Promise<ReactNode> | ReactNode
> = {
  balance: BalanceBlock,
  "month-totals": MonthTotalsBlock,
  budget: BudgetBlock,
  "upcoming-bills": UpcomingBillsBlock,
  accounts: AccountsBlock,
  goals: GoalsBlock,
  insight: InsightBlock,
  "spending-calendar": SpendingCalendarBlockLoader,
  "cash-flow": CashFlowBlockLoader,
  "category-breakdown": CategoryBreakdownBlockLoader,
  "income-expense": IncomeExpenseBlockLoader,
  "net-worth": NetWorthBlockLoader,
  "daily-spend": DailySpendBlockLoader,
  "top-expenses": TopExpensesBlockLoader,
  "installments-ending": InstallmentsEndingBlockLoader,
  "month-comparison": MonthComparisonBlockLoader,
  subscriptions: SubscriptionsBlockLoader,
  shared: SharedBlockLoader,
};

/** The block of one id of the catalog. */
export function HomeBlock({
  id,
  ...props
}: HomeBlockProps & { id: HomeBlockId }) {
  const Block = HOME_BLOCK_LOADERS[id];
  return <Block {...props} />;
}

/** Keeps a month other than the current one in the links. */
function withMonth(range: PeriodRange, path: string) {
  return range.isCurrent
    ? path
    : `${path}${path.includes("?") ? "&" : "?"}mes=${range.month}`;
}

async function BalanceBlock({ ctx, range }: HomeBlockProps) {
  const summary = await getBalanceSummary(ctx, range);
  return (
    <BalanceHero
      balanceCents={summary.balanceCents}
      monthChangeCents={summary.monthChangeCents}
      monthName={monthName(range.month)}
      forecast={summary.forecast}
      savingsBoxCents={summary.savingsBoxCents}
      untilLabel={shortDateLabel(range.end)}
    />
  );
}

async function MonthTotalsBlock({ ctx, range }: HomeBlockProps) {
  const totals = await periodTotals(ctx, range.start, range.end);
  return (
    <div className="grid grid-cols-fit gap-3">
      <StatTile
        icon={<ArrowDownLeft />}
        iconClassName="bg-cat-3-bg text-cat-3-fg"
        label="Receitas"
        value={
          <Money cents={totals.incomeCents} variant="title" tone="neutral" />
        }
        support={
          totals.pendingIncomeCents > 0 ? (
            <>
              <Money
                cents={totals.pendingIncomeCents}
                variant="caption"
                sign="always"
                className="text-inherit"
              />{" "}
              a receber
            </>
          ) : (
            "Nada a receber"
          )
        }
        href={withMonth(range, "/extrato?tipo=receita")}
      />
      <StatTile
        icon={<ArrowUpRight />}
        iconClassName="bg-cat-2-bg text-cat-2-fg"
        label="Despesas"
        value={
          <Money cents={totals.expenseCents} variant="title" tone="neutral" />
        }
        support={
          totals.pendingExpenseCents > 0 ? (
            <>
              <Money
                cents={totals.pendingExpenseCents}
                variant="caption"
                tone="neutral"
                className="text-inherit"
              />{" "}
              agendados
            </>
          ) : (
            "Nada agendado"
          )
        }
        href={withMonth(range, "/extrato?tipo=despesa")}
      />
    </div>
  );
}

async function BudgetBlock({ ctx, range }: HomeBlockProps) {
  const budgets = await getBudgets(ctx, range);
  const href = withMonth(range, "/planejar/orcamentos");
  return budgets.total ? (
    <BudgetCard
      total={budgets.total}
      items={budgets.items}
      monthName={monthName(range.month)}
      isCurrent={range.isCurrent}
      endLabel={shortDateLabel(range.end)}
      href={href}
    />
  ) : (
    <BudgetInvite href={href} />
  );
}

/**
 * Always the next 7 days from today: in another month (`?mes=`) a caption
 * says so, since the rest of the Início shows that month.
 */
async function UpcomingBillsBlock({ ctx, range }: HomeBlockProps) {
  const [items, nonBusiness] = await Promise.all([
    getUpcoming(ctx),
    isFlagEnabled("alerta_dia_nao_util", ctx.userId),
  ]);
  const upcoming = nonBusiness
    ? await withNonBusinessDue(items, ctx.todayIso)
    : items;
  return (
    <section
      aria-labelledby="proximas-contas"
      aria-describedby={range.isCurrent ? undefined : "proximas-contas-hoje"}
    >
      <SectionHeader
        id="proximas-contas"
        title="Próximas contas"
        action={
          <SectionLink href="/extrato?status=pendente">Ver todas</SectionLink>
        }
        className={range.isCurrent ? undefined : "mb-0.5"}
      />
      {range.isCurrent ? null : (
        <p id="proximas-contas-hoje" className="mb-3 text-caption text-fg-3">
          A partir de hoje
        </p>
      )}
      <UpcomingBills items={upcoming} today={ctx.todayIso} />
    </section>
  );
}

async function AccountsBlock({ ctx }: HomeBlockProps) {
  const { accounts, currentInvoiceCents } = await getAccountsStrip(ctx);
  return (
    <section aria-labelledby="contas-carrossel">
      <SectionHeader
        id="contas-carrossel"
        title="Contas"
        action={<SectionLink href="/contas">Gerenciar</SectionLink>}
      />
      <AccountsCarousel
        accounts={accounts}
        currentInvoiceCents={currentInvoiceCents}
      />
    </section>
  );
}

async function GoalsBlock({ ctx }: HomeBlockProps) {
  const goals = await listGoals(ctx);
  return (
    <section aria-labelledby="metas-resumo">
      <SectionHeader
        id="metas-resumo"
        title="Metas"
        action={
          goals.length > 0 ? (
            <SectionLink href="/planejar/metas">Ver todas</SectionLink>
          ) : undefined
        }
      />
      {goals.length > 0 ? (
        <GoalsCard goals={goals} href="/planejar/metas" />
      ) : (
        <GoalsInvite href="/planejar/metas" />
      )}
    </section>
  );
}

/** Nothing at all without a highlight, so the slot collapses. */
async function InsightBlock({ ctx, range }: HomeBlockProps) {
  const insight = await categoryInsight(ctx, range);
  return insight ? <InsightCard insight={insight} userId={ctx.userId} /> : null;
}

/** Calendário de gastos: the report's heatmap for the month on screen. */
async function SpendingCalendarBlockLoader({ ctx, range }: HomeBlockProps) {
  const days = await dailySpending(ctx, range);
  if (days.every((day) => day.paidCount === 0 && day.pendingCount === 0)) {
    return <SpendingCalendarInvite monthName={monthName(range.month)} />;
  }
  return (
    <SpendingCalendarBlock
      days={days}
      today={ctx.todayIso}
      monthTitle={monthLabel(range.month)}
      reportHref={monthViewHref(
        "/relatorios/calendario",
        range.month,
        resolvePeriod(ctx, null).month,
      )}
      phase={reportPhase(ctx, range)}
    />
  );
}

/** Fluxo de caixa: the report's daily balance for the month on screen. */
async function CashFlowBlockLoader({ ctx, range }: HomeBlockProps) {
  const before = await noRecordsBefore(ctx, range);
  if (before) return before;
  const report = await cashFlowReport(ctx, range);
  if (!report.hasAccounts) return <CashFlowNoAccountsInvite />;
  if (isCashFlowEmpty(report)) {
    return <CashFlowInvite monthName={monthName(range.month)} />;
  }
  return (
    <CashFlowBlock
      report={report}
      start={range.start}
      end={range.end}
      today={ctx.todayIso}
      reportHref={monthViewHref(
        "/relatorios/fluxo",
        range.month,
        resolvePeriod(ctx, null).month,
      )}
    />
  );
}

/**
 * Para onde foi o dinheiro: what was paid in the month on screen; the report
 * opens on that same month (`?periodo=1&mes=`).
 */
async function CategoryBreakdownBlockLoader({ ctx, range }: HomeBlockProps) {
  const before = await noRecordsBefore(ctx, range);
  if (before) return before;
  const { items, totalCents } = await categoryBreakdown(
    ctx,
    range.start,
    range.end,
  );
  if (items.length === 0) {
    return <CategoryBreakdownInvite monthName={monthName(range.month)} />;
  }
  const currentMonth = resolvePeriod(ctx, null).month;
  return (
    <CategoryBreakdownBlock
      items={items}
      totalCents={totalCents}
      hrefFor={(categoryId) =>
        categoryDetailHref(categoryId, 1, range.month, currentMonth)
      }
      monthName={monthName(range.month)}
      isCurrent={range.isCurrent}
      link={{
        href: periodViewHref(
          "/relatorios/categorias",
          1,
          range.month,
          currentMonth,
        ),
        label: "Ver relatório",
      }}
    />
  );
}

/** Receitas × despesas: the 6 months up to the one on screen. */
async function IncomeExpenseBlockLoader({ ctx, range }: HomeBlockProps) {
  const end = seriesEnd(ctx, range);
  const before = await noRecordsBefore(ctx, end);
  if (before) return before;
  const months = await monthlySeries(ctx, end, INCOME_EXPENSE_BLOCK_MONTHS);
  if (
    months.every((month) => month.incomeCents === 0 && month.expenseCents === 0)
  ) {
    return <IncomeExpenseInvite />;
  }
  return (
    <IncomeExpenseBlock
      months={months}
      endMonthName={monthName(end.month)}
      partialProgress={partialProgress(
        months,
        resolvePeriod(ctx, null),
        ctx.todayIso,
      )}
      reportHref={periodViewHref(
        "/relatorios/visao-geral",
        INCOME_EXPENSE_BLOCK_MONTHS,
        end.month,
        resolvePeriod(ctx, null).month,
      )}
    />
  );
}

/** Patrimônio: the end of each of the last months, up to the one on screen. */
async function NetWorthBlockLoader({ ctx, range }: HomeBlockProps) {
  const before = await noRecordsBefore(ctx, seriesEnd(ctx, range));
  if (before) return before;
  const points = await netWorthSeries(
    ctx,
    seriesEnd(ctx, range),
    NET_WORTH_BLOCK_POINTS,
  );
  if (points.every((point) => point.cents === 0)) return <NetWorthInvite />;
  // Starts at the first record, like the report (months before it are zeros).
  const first = await firstRecordOn(ctx);
  const shown = trimToFirstRecord(
    points,
    first ? periodMonthOf(ctx, first) : null,
  );
  return (
    <NetWorthBlock
      points={shown}
      caption={
        reportPhase(ctx, range) === "past"
          ? `no fim de ${monthName(range.month)}`
          : "hoje"
      }
      reportHref={periodViewHref(
        "/relatorios/patrimonio",
        6,
        seriesEnd(ctx, range).month,
        resolvePeriod(ctx, null).month,
      )}
    />
  );
}

/**
 * Quanto dá para gastar por dia: always from today to the end of the month
 * that contains it, whatever month the Início shows (`?mes=`), so there is
 * no "no records before" invite: a caption says where it starts.
 */
async function DailySpendBlockLoader({ ctx, range }: HomeBlockProps) {
  const spendable = await getSpendablePerDay(ctx);
  if (!spendable.hasAccounts) return <SpendablePerDayNoAccountsInvite />;
  return (
    <SpendablePerDayBlock
      spendable={spendable}
      today={ctx.todayIso}
      isCurrent={range.isCurrent}
    />
  );
}

/**
 * Comparado ao mês passado: the month on screen up to today (or whole, when
 * it is over) against the same point of the month before; the report and
 * each category's detail open on that same month.
 */
async function MonthComparisonBlockLoader({ ctx, range }: HomeBlockProps) {
  const before = await noRecordsBefore(ctx, range);
  if (before) return before;
  const comparison = await monthComparison(ctx, range);
  if (!comparison) {
    return <MonthComparisonFutureInvite monthName={monthName(range.month)} />;
  }
  if (
    comparison.total.currentCents === 0 &&
    comparison.total.baselineCents === 0
  ) {
    return (
      <MonthComparisonInvite
        monthName={monthName(comparison.month)}
        previousMonthName={monthName(comparison.previousMonth)}
      />
    );
  }
  const currentMonth = resolvePeriod(ctx, null).month;
  return (
    <MonthComparisonBlock
      comparison={comparison}
      monthName={monthName(comparison.month)}
      previousMonthName={monthName(comparison.previousMonth)}
      reportHref={periodViewHref(
        "/relatorios/categorias",
        1,
        range.month,
        currentMonth,
      )}
      hrefFor={(categoryId) =>
        categoryDetailHref(categoryId, 1, range.month, currentMonth)
      }
      minDiffCents={MONTH_COMPARISON_MIN_DIFF_CENTS}
    />
  );
}

/**
 * Maior gasto da semana: always the last 7 days, whatever month the Início
 * shows. The week can cross the turn of the financial month, so each row
 * opens the statement of its own entry's month (account, kind and the start
 * of the description narrow it down); the header goes to the expenses.
 */
async function TopExpensesBlockLoader({ ctx }: HomeBlockProps) {
  const items = await biggestExpenses(ctx);
  if (items.length === 0) return <TopExpensesInvite />;
  const currentMonth = resolvePeriod(ctx, null).month;
  return (
    <TopExpensesBlock
      items={items}
      today={ctx.todayIso}
      extractHref="/extrato?tipo=despesa"
      hrefFor={(item) =>
        statementHref(
          {
            month: periodMonthOf(ctx, item.occurredOn),
            accountId: item.accountId,
            categoryId: null,
            kind: "expense",
            status: null,
            q: item.description.slice(0, MAX_QUERY_LENGTH),
          },
          currentMonth,
        )
      }
    />
  );
}

/**
 * Parcelas a terminar: always the pending installments from here on (overdue
 * ones included), whatever month the Início shows. Each row opens the
 * statement of its next installment's month, narrowed to pending expenses.
 */
async function InstallmentsEndingBlockLoader({ ctx }: HomeBlockProps) {
  const summary = await installmentsEnding(ctx);
  if (summary.items.length === 0) return <InstallmentsEndingInvite />;
  const currentMonth = resolvePeriod(ctx, null).month;
  return (
    <InstallmentsEndingBlock
      summary={summary}
      hrefFor={(item) =>
        statementHref(
          {
            month: periodMonthOf(ctx, item.nextOn),
            accountId: item.accountId,
            categoryId: null,
            kind: "expense",
            status: "pending",
            q: item.description.slice(0, MAX_QUERY_LENGTH),
          },
          currentMonth,
        )
      }
    />
  );
}

/**
 * Assinaturas do mês: always from today, whatever month the Início shows.
 * Each row opens the statement of its next debit's month, narrowed to the
 * pending expenses of its account.
 */
async function SubscriptionsBlockLoader({ ctx }: HomeBlockProps) {
  const summary = await monthlySubscriptions(ctx);
  if (summary.items.length === 0) return <SubscriptionsInvite />;
  const currentMonth = resolvePeriod(ctx, null).month;
  return (
    <SubscriptionsBlock
      summary={summary}
      today={ctx.todayIso}
      hrefFor={(item) =>
        statementHref(
          {
            month: periodMonthOf(ctx, item.nextOn),
            accountId: item.accountId,
            categoryId: null,
            kind: "expense",
            status: "pending",
            q: item.description.slice(0, MAX_QUERY_LENGTH),
          },
          currentMonth,
        )
      }
    />
  );
}

/**
 * The invite of a month that ends before the person's first record (balances
 * would project back as a flat line), or null when it has records. Only the
 * blocks that chart a stretch of time or project balances ask.
 */
async function noRecordsBefore(
  ctx: UserContext,
  range: PeriodRange,
): Promise<ReactNode> {
  const first = await firstRecordOn(ctx);
  if (!isBeforeFirstRecord(range.end, first) || !first) return null;
  const firstMonth = periodMonthOf(ctx, first);
  return (
    <BlockNoRecords
      month={range.month}
      firstMonth={firstMonth}
      href={`/inicio?mes=${firstMonth}`}
    />
  );
}

/**
 * The last month of a series of months: the one on screen, or today's for a
 * month ahead (nothing has happened there yet to chart).
 */
export function seriesEnd(ctx: UserContext, range: PeriodRange): PeriodRange {
  return reportPhase(ctx, range) === "future"
    ? resolvePeriod(ctx, null)
    : range;
}

/** Ghost link of a section header ("Ver todas"): 44px tall, 24px in the row. */
function SectionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="-my-2.5 -mr-2 inline-flex h-11 items-center rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
    >
      {children}
    </Link>
  );
}

/**
 * Compartilhado (financas_compartilhadas): only with a group or an invite;
 * otherwise nothing, and the slot closes up.
 */
async function SharedBlockLoader({ ctx }: HomeBlockProps) {
  if (!(await isFlagEnabled("financas_compartilhadas", ctx.userId)))
    return null;
  const { groups, invites } = await listMyGroups(ctx);
  if (groups.length === 0 && invites.length === 0) return null;
  return <SharedBlock groups={groups} invites={invites} />;
}
