// The notification center's time logic (doc 02 §6.15): which section a
// notice goes in, the small time label on it and the number on the bell.
// Pure: "now" and the time zone are arguments.
import { daysBetween, parse } from "@/lib/finance/dates";
import { relativeDayLabel } from "@/lib/format/date";
import { clockLabel, localDayOf } from "@/lib/format/datetime";

export type NoticeSection = "today" | "week" | "earlier";

export const SECTION_LABELS: Record<NoticeSection, string> = {
  today: "Hoje",
  week: "Esta semana",
  earlier: "Antes",
};

/** "Esta semana" are the days of the 6 local days before today. */
const WEEK_DAYS = 6;

export type Dated = { createdAt: string | Date };

/**
 * Splits notices (newest first) into Hoje, Esta semana (the 6 local days
 * before today) and Antes. Empty sections are left out; the order of the
 * items is kept.
 */
export function groupNotifications<T extends Dated>(
  items: readonly T[],
  nowMs: number,
  timeZone: string,
): { section: NoticeSection; items: T[] }[] {
  const today = parse(localDayOf(nowMs, timeZone));
  const buckets: Record<NoticeSection, T[]> = {
    today: [],
    week: [],
    earlier: [],
  };
  for (const item of items) {
    const ago = daysBetween(parse(localDayOf(item.createdAt, timeZone)), today);
    const section: NoticeSection =
      ago <= 0 ? "today" : ago <= WEEK_DAYS ? "week" : "earlier";
    buckets[section].push(item);
  }
  return (["today", "week", "earlier"] as const)
    .filter((section) => buckets[section].length > 0)
    .map((section) => ({ section, items: buckets[section] }));
}

/**
 * "06:12" today, "Ontem", "há 3 dias" up to 6 days, then "14/out" (the year
 * only in another year), doc 02 §10.1.
 */
export function noticeTimeLabel(
  createdAt: string | Date,
  nowMs: number,
  timeZone: string,
): string {
  const day = localDayOf(createdAt, timeZone);
  const today = localDayOf(nowMs, timeZone);
  if (day === today) return clockLabel(createdAt, timeZone);
  return relativeDayLabel(day, today);
}

/** The number on the bell: "1"…"9", "9+". */
export function unreadBadgeLabel(unread: number): string {
  return unread > 9 ? "9+" : String(Math.max(0, Math.floor(unread)));
}
