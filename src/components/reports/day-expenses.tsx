import { CalendarSearch, ChevronRight } from "lucide-react";
import Link from "next/link";
import { TransactionRow } from "@/components/finance/transaction-row";
import { Money } from "@/components/money/money";
import { toRowData } from "@/components/transactions/statement-data";
import { Button } from "@/components/ui/button";
import { dayHeaderLabel } from "@/lib/format/date";
import type { TransactionListItem } from "@/server/domain/transactions";

type DayExpensesProps = {
  /** `YYYY-MM-DD`. */
  date: string;
  items: TransactionListItem[];
  /** More than the list shows (a day with hundreds of entries). */
  hasMore: boolean;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** The month's expenses in the statement. */
  statementHref: string;
};

/**
 * The expenses of the day picked in the calendar (doc 02 §5.7, §6.12): its
 * total, the statement rows (scheduled ones with their badge) and the way to
 * the statement. Dims while the next day loads (`data-pending` above it).
 */
export function DayExpenses({
  date,
  items,
  hasMore,
  today,
  statementHref,
}: DayExpensesProps) {
  const paid = items.filter((item) => item.status === "paid");
  const paidCents = paid.reduce((sum, item) => sum - item.amountCents, 0);
  return (
    <section
      aria-labelledby="relatorio-dia"
      className="flex flex-col gap-2 transition-opacity duration-150 group-has-data-pending:opacity-60"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="relatorio-dia" className="text-headline text-fg">
          {dayHeaderLabel(date, today)}
        </h2>
        {paid.length > 0 ? (
          <span className="text-callout font-semibold text-fg-2">
            <Money
              cents={paidCents}
              variant="callout"
              tone="neutral"
              className="font-bold"
            />{" "}
            em {paid.length} {paid.length === 1 ? "despesa" : "despesas"}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-card bg-surface px-4 py-5 text-callout text-fg-2 shadow-card">
          Nenhuma despesa neste dia.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
          {items.map((item) => (
            <li key={item.id}>
              <TransactionRow txn={toRowData(item)} today={today} />
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <p className="text-caption text-fg-3">
          Mostrando as primeiras despesas do dia; o extrato tem todas.
        </p>
      ) : null}
      <Button asChild variant="secondary" className="self-start">
        <Link href={statementHref}>
          Ver no extrato
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

/** Before a day is picked: how to get one. */
export function DayExpensesHint() {
  return (
    <p className="flex items-center gap-2 rounded-card bg-surface px-4 py-4 text-callout text-fg-2 shadow-card">
      <CalendarSearch
        aria-hidden="true"
        className="size-5 shrink-0 text-fg-3"
      />
      Toque num dia para ver as despesas dele.
    </p>
  );
}
