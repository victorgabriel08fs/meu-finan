import { DayHeader } from "@/components/finance/day-header";
import {
  TransactionRow,
  type TransactionRowData,
} from "@/components/finance/transaction-row";
import { dayHeaderLabel } from "@/lib/format/date";
import type { TransactionListItem } from "@/server/domain/transactions";

type Day = { date: string; totalCents: number; items: TransactionListItem[] };

/** Groups a date-descending list by day, keeping the order. */
export function groupByDay(items: readonly TransactionListItem[]): Day[] {
  const days: Day[] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last && last.date === item.occurredOn) {
      last.items.push(item);
      last.totalCents += item.amountCents;
    } else {
      days.push({
        date: item.occurredOn,
        totalCents: item.amountCents,
        items: [item],
      });
    }
  }
  return days;
}

/**
 * In an account's statement the account name is implied, so the subtitle is
 * the category — or the other side of a transfer ("Para Reserva").
 */
function rowData(item: TransactionListItem): TransactionRowData {
  let subtitle: string;
  if (item.kind === "transfer") {
    const other = item.counterpartName ?? "outra conta";
    subtitle = item.amountCents < 0 ? `Para ${other}` : `De ${other}`;
  } else if (item.kind === "adjustment") {
    subtitle = "Ajuste de saldo";
  } else {
    subtitle = item.categoryName ?? "Sem categoria";
  }
  return { ...item, subtitle };
}

/** Statement of one account (doc 02 §5.7, §5.8): sticky day headers with the day's net. */
export function AccountTransactions({
  items,
  today,
}: {
  items: readonly TransactionListItem[];
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {groupByDay(items).map((day) => (
        <section key={day.date}>
          <DayHeader
            label={dayHeaderLabel(day.date, today)}
            totalCents={day.totalCents}
          />
          <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
            {day.items.map((item) => (
              <li key={item.id}>
                <TransactionRow txn={rowData(item)} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
