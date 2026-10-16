import { dayOfWeek, parse } from "@/lib/finance/dates";
import { fullDateLabel, shortDateLabel } from "@/lib/format/date";

/** Day labels of the daily reports (doc 02 §10.1), from `YYYY-MM-DD`. Pure. */

/** Indexed by `dayOfWeek` (0 = Sunday). */
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** "14 de outubro", "1º de novembro" (the full date without the year). */
export function dayMonthLabel(date: string): string {
  return fullDateLabel(date).replace(/ de \d{4}$/, "");
}

/** "qui, 1/out" (table rows). */
export function weekdayDateLabel(date: string): string {
  return `${WEEKDAYS[dayOfWeek(parse(date))]}, ${shortDateLabel(date)}`;
}

/** Day number inside a calendar cell; the first day of a month also names it ("1 nov"). */
export function calendarDayLabel(date: string, first: boolean): string {
  const day = Number(date.slice(8, 10));
  if (day !== 1 || first) return String(day);
  return `1 ${shortDateLabel(date).slice(2)}`;
}
