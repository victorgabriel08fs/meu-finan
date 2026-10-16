/**
 * pt-BR labels of the import screens (doc 02 §10), computed on the server in
 * the user's time zone so the server and the browser render the same text.
 */
import { localDateIn } from "@/lib/finance/dates";
import {
  periodLabel,
  relativeDayLabel,
  shortDateLabel,
} from "@/lib/format/date";
import type { RecentImport } from "@/server/domain/imports";
import type { RecentImportView } from "./types";

const formatInt = new Intl.NumberFormat("pt-BR");

/** "1/out – 14/out", or one date when the import covers a single day. */
export function importPeriodLabel(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;
  return start === end ? shortDateLabel(start) : periodLabel(start, end);
}

/** "1 lançamento", "1.234 lançamentos". */
export function entriesLabel(count: number): string {
  return `${formatInt.format(count)} ${count === 1 ? "lançamento" : "lançamentos"}`;
}

/** "Hoje às 10:32", "Ontem às 18:05", "12/out às 09:00". */
export function importedAtLabel(
  createdAt: Date,
  timeZone: string,
  today: string,
): string {
  const parts = localDateIn(createdAt, timeZone);
  const day = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(createdAt);
  return `${relativeDayLabel(day, today)} às ${time}`;
}

export function recentImportView(
  item: RecentImport,
  context: { timeZone: string; todayIso: string },
): RecentImportView {
  const period = importPeriodLabel(item.start, item.end);
  return {
    id: item.id,
    accountName: item.accountName,
    summary: period
      ? `${entriesLabel(item.imported)} · ${period}`
      : entriesLabel(item.imported),
    when: importedAtLabel(item.createdAt, context.timeZone, context.todayIso),
    undoable: item.undoable,
    undone: item.active === 0 && item.imported > 0,
    href:
      item.active > 0
        ? `/extrato?conta=${item.accountId}${item.month ? `&mes=${item.month}` : ""}`
        : null,
  };
}
