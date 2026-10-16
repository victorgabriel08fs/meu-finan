import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { SectionHeader } from "@/components/app/section-header";
import { StatTile } from "@/components/app/stat-tile";
import { AccountsCarousel } from "@/components/dashboard/accounts-carousel";
import { BalanceHero } from "@/components/dashboard/balance-hero";
import { BudgetCard, BudgetInvite } from "@/components/dashboard/budget-card";
import {
  DashboardColumns,
  DashboardSkeleton,
  HomeHeader,
  HomeHeaderSkeleton,
} from "@/components/dashboard/dashboard-layout";
import { FirstRunChecklist } from "@/components/dashboard/first-run-checklist";
import { GoalsCard, GoalsInvite } from "@/components/dashboard/goals-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import {
  greetingFor,
  monthName,
  weekdayDateLabel,
} from "@/components/dashboard/labels";
import { UpcomingBills } from "@/components/dashboard/upcoming-bills";
import { Money } from "@/components/money/money";
import { DEFAULT_TIME_ZONE } from "@/lib/finance/dates";
import { monthLabel, shortDateLabel, todayInTimeZone } from "@/lib/format/date";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { getDashboard } from "@/server/domain/dashboard";

export const metadata: Metadata = { title: "Início" };

/**
 * Início (doc 02 §6.3): "quanto tenho?", "como está o mês?", "o que vence
 * logo?". The greeting and the summary stream in separate boundaries; with
 * no account yet, the summary becomes the "Comece por aqui" checklist.
 */
export default function InicioPage({ searchParams }: PageProps<"/inicio">) {
  return (
    <div className="flex flex-col gap-4 pt-[env(safe-area-inset-top)]">
      <Suspense fallback={<HomeHeaderSkeleton />}>
        <Greeting />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <Summary searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const user = await requireUser();
  // Request time from here on (after the session read), so the clock is fine.
  const now = new Date();
  return (
    <HomeHeader
      name={user.name}
      greeting={greetingFor(now, DEFAULT_TIME_ZONE)}
      dateLabel={weekdayDateLabel(todayInTimeZone(DEFAULT_TIME_ZONE))}
    />
  );
}

async function Summary({
  searchParams,
}: {
  searchParams: PageProps<"/inicio">["searchParams"];
}) {
  const user = await requireUser();
  const [ctx, params] = await Promise.all([
    getUserContext(user.id),
    searchParams,
  ]);
  const range = resolvePeriod(
    ctx,
    typeof params.mes === "string" ? params.mes : null,
  );
  const data = await getDashboard(ctx, range);

  if (data.accounts.length === 0) return <FirstRunChecklist />;

  const month = monthName(range.month);
  const endLabel = shortDateLabel(range.end);
  /** Keeps a month other than the current one in the links. */
  const withMonth = (path: string) =>
    range.isCurrent
      ? path
      : `${path}${path.includes("?") ? "&" : "?"}mes=${range.month}`;
  const { totals } = data;

  return (
    <>
      {range.isCurrent ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 py-1.5 pr-1.5 pl-4">
          <p className="text-callout text-fg-2">
            Mostrando{" "}
            <strong className="font-semibold text-fg">
              {monthLabel(range.month)}
            </strong>
          </p>
          <Link
            href="/inicio"
            className="inline-flex h-11 items-center rounded-control px-3 text-callout font-semibold text-primary active:bg-surface-3"
          >
            Voltar para hoje
          </Link>
        </div>
      )}

      <DashboardColumns
        summary={
          <>
            <BalanceHero
              balanceCents={data.balanceCents}
              monthChangeCents={data.monthChangeCents}
              monthName={month}
              forecast={data.forecast}
              untilLabel={endLabel}
            />
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon={<ArrowDownLeft />}
                iconClassName="bg-cat-3-bg text-cat-3-fg"
                label="Receitas"
                value={
                  <Money
                    cents={totals.incomeCents}
                    variant="title"
                    tone="neutral"
                  />
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
                href={withMonth("/extrato?tipo=receita")}
              />
              <StatTile
                icon={<ArrowUpRight />}
                iconClassName="bg-cat-2-bg text-cat-2-fg"
                label="Despesas"
                value={
                  <Money
                    cents={totals.expenseCents}
                    variant="title"
                    tone="neutral"
                  />
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
                href={withMonth("/extrato?tipo=despesa")}
              />
            </div>
          </>
        }
        planning={
          <>
            {data.budgets.total ? (
              <BudgetCard
                total={data.budgets.total}
                items={data.budgets.items}
                monthName={month}
                isCurrent={range.isCurrent}
                endLabel={endLabel}
                href={withMonth("/planejar/orcamentos")}
              />
            ) : (
              <BudgetInvite href={withMonth("/planejar/orcamentos")} />
            )}
            <section aria-labelledby="proximas-contas">
              <SectionHeader
                id="proximas-contas"
                title="Próximas contas"
                action={
                  <SectionLink href="/extrato?status=pendente">
                    Ver todas
                  </SectionLink>
                }
              />
              <UpcomingBills items={data.upcoming} today={ctx.todayIso} />
            </section>
          </>
        }
        assets={
          <>
            <section aria-labelledby="contas-carrossel">
              <SectionHeader
                id="contas-carrossel"
                title="Contas"
                action={<SectionLink href="/contas">Gerenciar</SectionLink>}
              />
              <AccountsCarousel accounts={data.accounts} />
            </section>
            <section aria-labelledby="metas-resumo">
              <SectionHeader
                id="metas-resumo"
                title="Metas"
                action={
                  data.goals.length > 0 ? (
                    <SectionLink href="/planejar/metas">Ver todas</SectionLink>
                  ) : undefined
                }
              />
              {data.goals.length > 0 ? (
                <GoalsCard goals={data.goals} href="/planejar/metas" />
              ) : (
                <GoalsInvite href="/planejar/metas" />
              )}
            </section>
            {data.insight ? <InsightCard insight={data.insight} /> : null}
          </>
        }
      />
    </>
  );
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
