import { Archive, ArrowUpRight, ReceiptText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountActions } from "@/components/accounts/account-actions";
import {
  type AccountSnapshot,
  accountTypeLabel,
} from "@/components/accounts/account-meta";
import { AccountTransactions } from "@/components/accounts/account-transactions";
import { EmptyState } from "@/components/app/empty-state";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import { monthName } from "@/components/dashboard/labels";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { periodLabel } from "@/lib/format/date";
import { requireUser } from "@/server/dal";
import { type AccountListItem, listAccounts } from "@/server/domain/accounts";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { listTransactions } from "@/server/domain/transactions";

export const metadata: Metadata = { title: "Conta" };

const BACK = { href: "/contas", label: "Contas" };

/**
 * Detalhe da conta (doc 02 §6.7): balance, in-line actions (Ajustar saldo ·
 * Editar · Arquivar) and the account's statement for the period (`?mes=`).
 * Credit cards live at /cartoes/[id].
 */
export default function ContaPage({
  params,
  searchParams,
}: PageProps<"/contas/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccountDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/contas/[id]">["params"];
  searchParams: PageProps<"/contas/[id]">["searchParams"];
}) {
  const user = await requireUser();
  const [{ id }, query, ctx, accounts] = await Promise.all([
    params,
    searchParams,
    getUserContext(user.id),
    listAccounts(user.id, { includeArchived: true }),
  ]);
  const account = accounts.find((item) => item.id === id);

  if (!account) {
    return (
      <>
        <PageHeader title="Conta" back={BACK} />
        <EmptyState
          icon={<SearchX />}
          title="Conta não encontrada"
          description="Ela pode ter sido removida, ou o link está incompleto."
          action={
            <Button asChild variant="tonal">
              <Link href="/contas">Ver contas</Link>
            </Button>
          }
        />
      </>
    );
  }
  if (account.type === "credit_card") redirect(`/cartoes/${account.id}`);

  const range = resolvePeriod(
    ctx,
    typeof query.mes === "string" ? query.mes : null,
  );
  const currentMonth = resolvePeriod(ctx, null).month;
  const { items, hasMore } = await listTransactions(ctx, {
    start: range.start,
    end: range.end,
    accountId: account.id,
  });
  const month = monthName(range.month);
  const extratoHref = `/extrato?conta=${account.id}${
    range.isCurrent ? "" : `&mes=${range.month}`
  }`;
  const snapshot: AccountSnapshot = {
    id: account.id,
    name: account.name,
    type: account.type,
    color: account.color,
    icon: account.icon,
    balanceCents: account.balanceCents,
    includeInNetWorth: account.includeInNetWorth,
    card: account.card,
  };

  return (
    <>
      <PageHeader title={account.name} back={BACK} />
      <AccountHero account={account} />
      {account.archived ? (
        <p className="flex items-center gap-2 rounded-control bg-surface-2 px-4 py-3 text-callout text-fg-2">
          <Archive aria-hidden="true" className="size-5 shrink-0" />
          Conta arquivada: ela não entra nos totais e não recebe lançamentos.
        </p>
      ) : (
        <AccountActions account={snapshot} />
      )}

      <section aria-labelledby="lancamentos-da-conta" className="mt-1">
        <SectionHeader
          id="lancamentos-da-conta"
          title={`Lançamentos de ${month}`}
          action={
            <Link
              href={extratoHref}
              className="-my-2.5 -mr-2 inline-flex h-11 items-center gap-0.5 rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
            >
              Ver no extrato
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
        <MonthSwitcher
          month={range.month}
          currentMonth={currentMonth}
          hrefFor={(target) =>
            target === currentMonth
              ? `/contas/${account.id}`
              : `/contas/${account.id}?mes=${target}`
          }
          className="mb-1"
        />
        {ctx.monthStartDay === 1 ? null : (
          <p className="mb-2 text-center text-caption text-fg-3">
            {periodLabel(range.start, range.end)}
          </p>
        )}
        {items.length > 0 ? (
          <>
            <AccountTransactions items={items} today={ctx.todayIso} />
            {hasMore ? (
              <p className="mt-4 text-center text-callout text-fg-2">
                Mostrando os lançamentos mais recentes.{" "}
                <Link
                  href={extratoHref}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Ver todos no extrato
                </Link>
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<ReceiptText />}
            title={`Nenhum lançamento em ${month}`}
            description="Os lançamentos desta conta no período aparecem aqui."
            className="py-8"
          />
        )}
      </section>
    </>
  );
}

function AccountHero({ account }: { account: AccountListItem }) {
  const projected = account.balanceCents + account.pendingCents;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <CategoryIcon
          icon={account.icon}
          color={account.color}
          shape="square"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-overline uppercase text-fg-3">
            {accountTypeLabel(account.type)}
          </span>
          <span className="text-caption text-fg-3">Saldo atual</span>
        </div>
        {account.archived ? <Badge>Arquivada</Badge> : null}
        {!account.archived && !account.includeInNetWorth ? (
          <Badge>Fora do patrimônio</Badge>
        ) : null}
      </div>
      <Money
        cents={account.balanceCents}
        variant="display"
        tone="neutral"
        className="mt-3 block"
      />
      {account.pendingCents !== 0 ? (
        <p className="mt-2 text-caption text-fg-3">
          Com os agendados:{" "}
          <Money
            cents={projected}
            variant="caption"
            tone="neutral"
            className="font-semibold text-fg-2"
          />{" "}
          (
          <Money
            cents={account.pendingCents}
            variant="caption"
            sign="always"
            tone="neutral"
            className="text-inherit"
          />{" "}
          pendente)
        </p>
      ) : null}
    </Card>
  );
}

function AccountSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center">
          <Skeleton className="h-6 w-20 rounded-chip" />
        </div>
        <Skeleton className="h-8.5 w-48 rounded-chip" />
      </div>
      <Skeleton className="h-41 rounded-card" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-19 rounded-card" />
        <Skeleton className="h-19 rounded-card" />
        <Skeleton className="h-19 rounded-card" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40 rounded-chip" />
        <Skeleton className="mx-auto h-11 w-64 rounded-full" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </LoadingRegion>
  );
}
