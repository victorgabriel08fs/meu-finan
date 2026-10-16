import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { shortDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { ShowMore } from "./show-more";

export type InvoiceEntryView = {
  id: string;
  description: string;
  /** Ledger sign: purchases < 0, refunds > 0. */
  amountCents: number;
  occurredOn: string;
  status: "pending" | "paid";
  kind: "income" | "expense" | "transfer" | "adjustment";
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  /** `count` is null when the plan could not be read. */
  installment: { number: number; count: number | null } | null;
};

const listClass = "[&>li+li]:border-t [&>li+li]:border-border";

/**
 * Purchases of an invoice (doc 02 §6.8): category icon (dashed while
 * scheduled), the installment badge "2/6", "Categoria · 16/out · Agendado"
 * and the amount owed, tabular. Long invoices expand in place.
 */
export function InvoiceEntries({ entries }: { entries: InvoiceEntryView[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <ShowMore initial={8} noun="lançamentos" className={listClass}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex min-h-16 items-center gap-3 px-4 py-2.5"
          >
            <InvoiceEntryRow entry={entry} />
          </li>
        ))}
      </ShowMore>
    </Card>
  );
}

function InvoiceEntryRow({ entry }: { entry: InvoiceEntryView }) {
  const pending = entry.status === "pending";
  const credit = entry.amountCents > 0;
  const subtitle = [
    entry.categoryName ??
      (entry.kind === "adjustment" ? "Ajuste de saldo" : "Sem categoria"),
    shortDateLabel(entry.occurredOn),
    pending ? "Agendado" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <CategoryIcon
        icon={
          entry.categoryIcon ??
          (entry.kind === "adjustment" ? "scale" : "ellipsis")
        }
        color={entry.categoryColor ?? "neutral"}
        dashed={pending}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-headline text-fg">
            {entry.description}
          </span>
          {entry.installment ? (
            <Badge className="h-4.5 shrink-0 px-1 text-micro">
              {entry.installment.count
                ? `${entry.installment.number}/${entry.installment.count}`
                : `${entry.installment.number}ª parcela`}
            </Badge>
          ) : null}
        </p>
        <p className="truncate text-caption text-fg-3">{subtitle}</p>
      </div>
      {credit ? (
        <Money cents={entry.amountCents} variant="headline" sign="always" />
      ) : (
        <Money
          cents={-entry.amountCents}
          variant="headline"
          tone="neutral"
          sign="never"
          className={cn(pending && "text-fg-2")}
        />
      )}
    </>
  );
}

/** Payments linked to the invoice (scheduled ones flagged). */
export function InvoicePayments({
  payments,
}: {
  payments: {
    id: string;
    amountCents: number;
    occurredOn: string;
    status: "pending" | "paid";
  }[];
}) {
  return (
    <Card className="overflow-hidden p-0">
      <ul className={listClass}>
        {payments.map((payment) => {
          const pending = payment.status === "pending";
          return (
            <li
              key={payment.id}
              className="flex min-h-14 items-center gap-3 px-4 py-2"
            >
              <CategoryIcon
                icon="arrow-left-right"
                color="transfer"
                size="sm"
                dashed={pending}
                className="size-9"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-fg">
                  Pagamento
                </span>
                <span className="truncate text-caption text-fg-3">
                  {shortDateLabel(payment.occurredOn)}
                  {pending ? " · Agendado" : ""}
                </span>
              </div>
              <Money
                cents={Math.abs(payment.amountCents)}
                variant="headline"
                tone="transfer"
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
