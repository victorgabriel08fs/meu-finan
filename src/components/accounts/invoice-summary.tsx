import {
  CalendarCheck,
  Check,
  CircleAlert,
  CircleCheck,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InvoiceStatus } from "@/lib/finance/invoices";
import { monthLabel, shortDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import {
  INVOICE_STATUS,
  type InvoiceView,
  invoiceTiming,
} from "./invoice-meta";
import { PayInvoiceSheet, type PaymentAccount } from "./pay-invoice-sheet";

function StatusIcon({ status }: { status: InvoiceStatus }) {
  if (status === "paid") return <Check aria-hidden="true" strokeWidth={3} />;
  if (status === "closed") return <Lock aria-hidden="true" />;
  if (status === "overdue") return <CircleAlert aria-hidden="true" />;
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 rounded-full", INVOICE_STATUS.open.dot)}
    />
  );
}

type InvoiceSummaryCardProps = {
  invoice: InvoiceView;
  /** `YYYY-MM-DD`. */
  today: string;
  cardName: string;
  /** Owed in single payments and in installments, when there are both. */
  split: { cashCents: number; installmentCents: number } | null;
  paymentAccounts: PaymentAccount[];
};

/**
 * The invoice on screen (doc 02 §6.8): status badge with icon (Aberta ·
 * Fechada · Paga · Vencida) and how far the next date is, total, closing and
 * due dates, and "Pagar fatura".
 */
export function InvoiceSummaryCard({
  invoice,
  today,
  cardName,
  split,
  paymentAccounts,
}: InvoiceSummaryCardProps) {
  const meta = INVOICE_STATUS[invoice.status];
  const month = monthLabel(invoice.referenceMonth).split(" de ")[0];

  return (
    <Card className="flex flex-col gap-2.5 pt-4.5">
      <h2 className="sr-only">
        Fatura de {monthLabel(invoice.referenceMonth)}
      </h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge
          tone={meta.tone}
          className="h-6.5 gap-1.5 rounded-full px-2.5 font-bold"
        >
          <StatusIcon status={invoice.status} />
          {meta.label}
        </Badge>
        <span className="text-caption font-semibold text-fg-2">
          {invoiceTiming(invoice, today)}
        </span>
      </div>

      <Money
        cents={invoice.totalCents}
        variant="title"
        tone="neutral"
        className="text-title-1"
      />
      <p className="text-callout text-fg-2">
        Fecha {shortDateLabel(invoice.closingDate)} · Vence{" "}
        {shortDateLabel(invoice.dueDate)}
      </p>
      {invoice.paidCents > 0 ? (
        <p className="text-callout text-fg-2">
          Pago{" "}
          <Money
            cents={invoice.paidCents}
            variant="callout"
            tone="neutral"
            className="font-semibold text-inherit"
          />
          {invoice.outstandingCents > 0 ? (
            <>
              {" "}
              · Falta{" "}
              <Money
                cents={invoice.outstandingCents}
                variant="callout"
                tone="neutral"
                className="font-bold"
              />
            </>
          ) : null}
        </p>
      ) : null}

      {split ? (
        <dl className="mt-1 grid grid-cols-2 gap-2 border-y border-border py-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-micro font-semibold text-fg-3">
              Compras à vista
            </dt>
            <dd>
              <Money
                cents={split.cashCents}
                variant="headline"
                tone="neutral"
                className="font-bold"
              />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-micro font-semibold text-fg-3">Parcelas</dt>
            <dd>
              <Money
                cents={split.installmentCents}
                variant="headline"
                tone="neutral"
                className="font-bold"
              />
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-2">
        {invoice.id && invoice.outstandingCents > 0 ? (
          paymentAccounts.length > 0 ? (
            <PayInvoiceSheet
              invoiceId={invoice.id}
              outstandingCents={invoice.outstandingCents}
              invoiceLabel={`Fatura de ${month} do ${cardName}`}
              accounts={paymentAccounts}
              today={today}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-callout text-fg-2">
                Para pagar, cadastre a conta de onde sai o dinheiro.
              </p>
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href="/contas/nova">Cadastrar conta</Link>
              </Button>
            </div>
          )
        ) : (
          <p className="flex items-center gap-2 rounded-control bg-bg px-3 py-2.5 text-callout text-fg-2">
            <CircleCheck
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
            />
            {invoice.totalCents === 0
              ? "Nenhuma compra nesta fatura até agora."
              : "Nada em aberto nesta fatura."}
          </p>
        )}
      </div>
    </Card>
  );
}

/** "Melhor dia de compra" (doc 02 §6.8): from the closing day on, the next invoice. */
export function BestDayCard({
  closingDay,
  closingDate,
  nextMonthName,
}: {
  closingDay: number;
  /** Closing date of the invoice that is open today. */
  closingDate: string;
  /** "novembro": the invoice after it. */
  nextMonthName: string;
}) {
  return (
    <Card className="flex items-center gap-3 py-3.5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
      >
        <CalendarCheck className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-body font-bold text-fg">
          Melhor dia de compra: {closingDay}
        </p>
        <p className="text-caption text-fg-3">
          Compras a partir de {shortDateLabel(closingDate)} entram na fatura de{" "}
          {nextMonthName}.
        </p>
      </div>
    </Card>
  );
}
