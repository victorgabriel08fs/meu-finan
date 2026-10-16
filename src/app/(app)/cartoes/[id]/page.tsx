import { Archive, ReceiptText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardHeaderActions } from "@/components/accounts/account-actions";
import type { AccountSnapshot } from "@/components/accounts/account-meta";
import { CardVisual } from "@/components/accounts/card-visual";
import {
  InvoiceEntries,
  type InvoiceEntryView,
  InvoicePayments,
} from "@/components/accounts/invoice-entries";
import {
  invoiceForMonth,
  invoiceTabLabel,
  invoiceTabMonths,
  shiftReferenceMonth,
} from "@/components/accounts/invoice-meta";
import {
  BestDayCard,
  InvoiceSummaryCard,
} from "@/components/accounts/invoice-summary";
import { InvoiceTabs } from "@/components/accounts/invoice-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import { monthName } from "@/components/dashboard/labels";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { listAccounts } from "@/server/domain/accounts";
import { getCardOverview, listInvoiceEntries } from "@/server/domain/cards";
import { getUserContext } from "@/server/domain/context";
import { DomainError } from "@/server/domain/errors";

export const metadata: Metadata = { title: "Cartão" };

const BACK = { href: "/contas", label: "Contas" };
const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Cartão de crédito e fatura (doc 02 §6.8): the card with its available
 * limit, invoice tabs (`?fatura=YYYY-MM`, the open invoice by default), the
 * invoice summary with "Pagar fatura", the best purchase day and the
 * invoice's entries.
 */
export default function CartaoPage({
  params,
  searchParams,
}: PageProps<"/cartoes/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<CardSkeleton />}>
        <CardDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CardDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/cartoes/[id]">["params"];
  searchParams: PageProps<"/cartoes/[id]">["searchParams"];
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
      <Missing
        title="Cartão não encontrado"
        description="Ele pode ter sido removido, ou o link está incompleto."
      />
    );
  }
  if (account.type !== "credit_card") redirect(`/contas/${account.id}`);
  if (account.archived) {
    return (
      <Missing
        title={`${account.name} está arquivado`}
        description="Cartões arquivados saem das listas e dos totais; o histórico continua guardado."
        archived
      />
    );
  }

  let overview: Awaited<ReturnType<typeof getCardOverview>>;
  try {
    overview = await getCardOverview(ctx, account.id);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return (
      <Missing
        title="Não deu para abrir o cartão"
        description="Confira o limite e os dias de fechamento e vencimento em Editar."
      />
    );
  }

  const currentMonth = overview.currentReferenceMonth;
  const selectedMonth =
    typeof query.fatura === "string" && MONTH_PARAM.test(query.fatura)
      ? query.fatura
      : currentMonth;
  const invoice = invoiceForMonth(
    selectedMonth,
    overview.invoices,
    overview.cycle,
    ctx.today,
  );
  const currentInvoice = invoiceForMonth(
    currentMonth,
    overview.invoices,
    overview.cycle,
    ctx.today,
  );

  const entries = invoice.id ? await listInvoiceEntries(ctx, invoice.id) : [];
  const purchases = entries.filter((entry) => entry.kind !== "transfer");
  const payments = entries.filter((entry) => entry.kind === "transfer");
  const views: InvoiceEntryView[] = purchases.map((entry) => ({
    id: entry.id,
    description: entry.description,
    amountCents: entry.amountCents,
    occurredOn: entry.occurredOn,
    status: entry.status,
    kind: entry.kind,
    categoryName: entry.categoryName,
    categoryIcon: entry.categoryIcon,
    categoryColor: entry.categoryColor,
    installment:
      entry.installmentNumber === null
        ? null
        : { number: entry.installmentNumber, count: entry.installmentCount },
  }));

  const installmentCents = owedBy(
    purchases.filter((entry) => entry.installmentNumber !== null),
  );
  const cashCents = owedBy(
    purchases.filter((entry) => entry.installmentNumber === null),
  );
  const split =
    installmentCents > 0 && cashCents > 0
      ? { cashCents, installmentCents }
      : null;

  const tabs = invoiceTabMonths(
    overview.invoices.map((item) => item.referenceMonth),
    currentMonth,
    selectedMonth,
  ).map((month) => {
    const view = invoiceForMonth(
      month,
      overview.invoices,
      overview.cycle,
      ctx.today,
    );
    return {
      month,
      label: invoiceTabLabel(month, currentMonth),
      href:
        month === currentMonth
          ? `/cartoes/${account.id}`
          : `/cartoes/${account.id}?fatura=${month}`,
      selected: month === selectedMonth,
      status: view.status,
      future: month > currentMonth,
      totalCents: view.totalCents,
    };
  });

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
  const paymentAccounts = accounts
    .filter((item) => item.type !== "credit_card" && !item.archived)
    .map(({ id: accountId, name, icon, color, balanceCents }) => ({
      id: accountId,
      name,
      icon,
      color,
      balanceCents,
    }));
  const selectedName = monthName(selectedMonth);

  return (
    <>
      <PageHeader
        title={account.name}
        back={BACK}
        actions={<CardHeaderActions account={snapshot} />}
      />
      <CardVisual
        name={account.name}
        closingDay={overview.cycle.closingDay}
        dueDay={overview.cycle.dueDay}
        limitCents={overview.limitCents}
        usedCents={overview.usedCents}
        futureCents={overview.futureCents}
        availableCents={overview.availableCents}
      />
      <InvoiceTabs tabs={tabs} />
      <InvoiceSummaryCard
        invoice={invoice}
        today={ctx.todayIso}
        cardName={account.name}
        split={split}
        paymentAccounts={paymentAccounts}
      />
      <BestDayCard
        closingDay={overview.cycle.closingDay}
        closingDate={currentInvoice.closingDate}
        nextMonthName={monthName(shiftReferenceMonth(currentMonth, 1))}
      />

      <section aria-labelledby="lancamentos-da-fatura" className="mt-3">
        <SectionHeader
          id="lancamentos-da-fatura"
          title="Lançamentos da fatura"
          action={
            views.length > 0 ? (
              <span className="text-caption font-semibold text-fg-3">
                {views.length === 1 ? "1 item" : `${views.length} itens`}
              </span>
            ) : undefined
          }
        />
        {views.length > 0 ? (
          <InvoiceEntries entries={views} />
        ) : (
          <EmptyState
            icon={<ReceiptText />}
            title={`Nenhuma compra na fatura de ${selectedName}`}
            description="Compras no cartão aparecem aqui, na fatura em que caem."
            className="py-8"
          />
        )}
      </section>

      {payments.length > 0 ? (
        <section aria-labelledby="pagamentos-da-fatura" className="mt-3">
          <SectionHeader id="pagamentos-da-fatura" title="Pagamentos" />
          <InvoicePayments payments={payments} />
        </section>
      ) : null}
    </>
  );
}

/** Owed amount (positive) of card entries: −Σ ledger amounts. */
function owedBy(entries: { amountCents: number }[]): number {
  return -entries.reduce((total, entry) => total + entry.amountCents, 0);
}

function Missing({
  title,
  description,
  archived = false,
}: {
  title: string;
  description: string;
  archived?: boolean;
}) {
  return (
    <>
      <PageHeader title="Cartão" back={BACK} />
      <EmptyState
        icon={archived ? <Archive /> : <SearchX />}
        title={title}
        description={description}
        action={
          <Button asChild variant="tonal">
            <Link href="/contas">Ver contas</Link>
          </Button>
        }
      />
    </>
  );
}

function CardSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex h-13 items-center justify-between">
          <Skeleton className="h-6 w-20 rounded-chip" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <Skeleton className="h-8.5 w-52 rounded-chip" />
      </div>
      <Skeleton className="h-50 rounded-card" />
      <div className="flex gap-2 overflow-hidden py-1">
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton key={key} className="h-13.5 w-21 shrink-0" />
        ))}
      </div>
      <Skeleton className="h-60 rounded-card" />
      <Skeleton className="h-18 rounded-card" />
      <div className="mt-3 flex flex-col gap-3">
        <Skeleton className="h-4 w-44 rounded-chip" />
        <Skeleton className="h-80 rounded-card" />
      </div>
    </LoadingRegion>
  );
}
