import type { TransactionRowData } from "@/components/finance/transaction-row";
import { dayOfWeek, parse } from "@/lib/finance/dates";
import { fullDateLabel, shortDateLabel } from "@/lib/format/date";
import type {
  RecurrenceRule,
  TransactionListItem,
} from "@/server/domain/transactions";

/**
 * Pure shaping of the statement list (doc 02 §6.4): pending entries in their
 * own "Agendados" section, the rest grouped by day with a day total, and the
 * summary of what the filters show.
 */

export type StatementItem = TransactionListItem;

export type DayGroup = {
  /** `YYYY-MM-DD`. */
  date: string;
  items: StatementItem[];
  /** Net income − expenses of the day; undefined when it has neither. */
  totalCents: number | undefined;
};

export type StatementSummary = {
  /** Paid income and expenses (magnitudes), as in `periodTotals`. */
  incomeCents: number;
  expenseCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  /** Total moved between accounts (magnitude). */
  transferCents: number;
};

const countsAsFlow = (item: StatementItem) =>
  item.kind === "income" || item.kind === "expense";

/** Splits pending entries (soonest first) from paid ones (as listed: newest first). */
export function splitScheduled(items: StatementItem[]): {
  scheduled: StatementItem[];
  settled: StatementItem[];
} {
  const scheduled = items
    .filter((item) => item.status === "pending")
    .sort((a, b) =>
      a.occurredOn === b.occurredOn
        ? a.description.localeCompare(b.description, "pt-BR")
        : a.occurredOn < b.occurredOn
          ? -1
          : 1,
    );
  const settled = items.filter((item) => item.status !== "pending");
  return { scheduled, settled };
}

/** Consecutive entries of the same day, keeping the list order. */
export function groupByDay(items: StatementItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    let group = groups.at(-1);
    if (!group || group.date !== item.occurredOn) {
      group = { date: item.occurredOn, items: [], totalCents: undefined };
      groups.push(group);
    }
    group.items.push(item);
    if (countsAsFlow(item)) {
      group.totalCents = (group.totalCents ?? 0) + item.amountCents;
    }
  }
  return groups;
}

/** Totals of the listed entries, for filters `periodTotals` cannot apply. */
export function summarize(items: StatementItem[]): StatementSummary {
  const summary: StatementSummary = {
    incomeCents: 0,
    expenseCents: 0,
    pendingIncomeCents: 0,
    pendingExpenseCents: 0,
    transferCents: 0,
  };
  for (const item of items) {
    const magnitude = Math.abs(item.amountCents);
    if (item.kind === "transfer") {
      summary.transferCents += magnitude;
    } else if (item.kind === "income") {
      if (item.status === "paid") summary.incomeCents += magnitude;
      else summary.pendingIncomeCents += magnitude;
    } else if (item.kind === "expense") {
      if (item.status === "paid") summary.expenseCents += magnitude;
      else summary.pendingExpenseCents += magnitude;
    }
  }
  return summary;
}

/** The row of the statement: transfers say where the money went. */
export function toRowData(item: StatementItem): TransactionRowData {
  const row: TransactionRowData = {
    id: item.id,
    description: item.description,
    amountCents: item.amountCents,
    kind: item.kind,
    status: item.status,
    occurredOn: item.occurredOn,
    categoryName: item.categoryName,
    categoryIcon: item.categoryIcon,
    categoryColor: item.categoryColor,
    accountName: item.accountName,
    installment: item.installment,
    recurring: item.recurring,
  };
  if (item.kind === "transfer") {
    row.subtitle =
      item.amountCents < 0
        ? `Transferência · de ${item.accountName}`
        : `Transferência · para ${item.accountName}`;
  }
  return row;
}

/** Indexed by `dayOfWeek` (0 = Sunday). */
const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/**
 * The rule of a recurring entry in words: "Todo mês, no dia 16", "A cada 2
 * semanas, na segunda", "Todo ano, em 16/out", plus ", até 1º de março de
 * 2027" when it ends.
 */
export function recurrenceLabel(
  rule: RecurrenceRule,
  occurredOn: string,
): string {
  const date = parse(occurredOn);
  const every = rule.interval > 1;
  let label: string;
  if (rule.freq === "weekly") {
    const weekday = dayOfWeek(date);
    const name = WEEKDAY_NAMES[weekday];
    const masculine = weekday === 0 || weekday === 6;
    label = every
      ? `A cada ${rule.interval} semanas, ${masculine ? "no" : "na"} ${name}`
      : `${masculine ? "Todo" : "Toda"} ${name}`;
  } else if (rule.freq === "monthly") {
    const day = rule.byMonthDay ?? date.day;
    const when = day === 31 ? "no último dia" : `no dia ${day}`;
    label = every
      ? `A cada ${rule.interval} meses, ${when}`
      : `Todo mês, ${when}`;
  } else {
    const when = `em ${shortDateLabel(occurredOn)}`;
    label = every
      ? `A cada ${rule.interval} anos, ${when}`
      : `Todo ano, ${when}`;
  }
  return rule.endOn ? `${label}, até ${fullDateLabel(rule.endOn)}` : label;
}

/** Origin and destination of a transfer leg, for the detail sheet. */
export function transferEnds(item: StatementItem): {
  from: string;
  to: string;
} {
  const counterpart = item.counterpartName ?? "outra conta";
  return item.amountCents < 0
    ? { from: item.accountName, to: counterpart }
    : { from: counterpart, to: item.accountName };
}
