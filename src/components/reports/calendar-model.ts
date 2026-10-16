import type { HeatmapDay } from "@/components/charts/calendar-heatmap";
import { formatMoneyShort } from "@/components/charts/format";
import { heatLevels } from "@/components/charts/heat-scale";
import { isValidDate } from "@/lib/finance/dates";
import type { DaySpending } from "@/server/domain/reports";
import { calendarDayLabel, dayMonthLabel } from "./day-labels";

/**
 * View model of Calendário (doc 02 §6.12): heat levels and spoken labels of
 * each day, the month's figures and the `?dia=` param. Pure.
 */

const expenses = (count: number, scheduled = false) =>
  `${count} ${count === 1 ? "despesa" : "despesas"}${
    scheduled ? (count === 1 ? " agendada" : " agendadas") : ""
  }`;

/**
 * "14 de outubro: R$ 230,40 em 3 despesas"; days to come speak of what is
 * scheduled ("20 de outubro: 1 despesa agendada, R$ 119,90").
 */
export function spendingDescription(day: DaySpending, today: string): string {
  const date = `${dayMonthLabel(day.date)}${day.date === today ? ", hoje" : ""}`;
  const scheduled =
    day.pendingCount > 0
      ? `${expenses(day.pendingCount, true)}, ${formatMoneyShort(day.pendingCents)}`
      : null;
  if (day.date > today) {
    return `${date}: ${scheduled ?? "dia a vir, nada agendado"}`;
  }
  const spent =
    day.paidCount > 0
      ? `${formatMoneyShort(day.paidCents)} em ${expenses(day.paidCount)}`
      : "sem despesas";
  return `${date}: ${spent}${scheduled ? `; ${scheduled}` : ""}`;
}

/** The cells of the heatmap: levels from the paid spending up to today. */
export function heatmapDays(
  days: readonly DaySpending[],
  today: string,
): HeatmapDay[] {
  const levels = heatLevels(
    days.map((day) => (day.date > today ? 0 : day.paidCents)),
  );
  return days.map((day, index) => ({
    date: day.date,
    label: calendarDayLabel(day.date, index === 0),
    level: levels[index] ?? 0,
    description: spendingDescription(day, today),
    future: day.date > today,
    today: day.date === today,
    marked: day.date > today && day.pendingCount > 0,
  }));
}

export type CalendarStats = {
  totalCents: number;
  /** Days of the month up to today (all of them for a past month). */
  elapsedDays: number;
  /** Whole cents per elapsed day; null before the month starts. */
  averageCents: number | null;
  daysWithout: number;
  /** The most expensive day (the earliest on ties); null without spending. */
  top: { date: string; cents: number } | null;
};

export function calendarStats(
  days: readonly DaySpending[],
  today: string,
): CalendarStats {
  const elapsed = days.filter((day) => day.date <= today);
  const totalCents = days.reduce((sum, day) => sum + day.paidCents, 0);
  let top: CalendarStats["top"] = null;
  for (const day of days) {
    if (day.paidCents > 0 && (!top || day.paidCents > top.cents)) {
      top = { date: day.date, cents: day.paidCents };
    }
  }
  return {
    totalCents,
    elapsedDays: elapsed.length,
    averageCents:
      elapsed.length > 0 ? Math.round(totalCents / elapsed.length) : null,
    daysWithout: elapsed.filter((day) => day.paidCents === 0).length,
    top,
  };
}

/** "12 dias sem gastos", "1 dia sem gastos". */
export function daysWithoutLabel(count: number): string {
  return `${count} ${count === 1 ? "dia" : "dias"} sem gastos`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `?dia=` when it is a real date inside the month on screen, otherwise null. */
export function parseDayParam(
  value: string | string[] | undefined | null,
  range: { start: string; end: string },
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !ISO_DATE.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  if (!isValidDate({ year, month, day })) return null;
  return raw >= range.start && raw <= range.end ? raw : null;
}
