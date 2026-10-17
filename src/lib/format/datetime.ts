import { TZDate } from "@date-fns/tz";
import {
  DEFAULT_TIME_ZONE,
  dayOfWeek,
  daysBetween,
  iso,
  localDateIn,
} from "@/lib/finance/dates";
import { relativeDayLabel, shortDateLabel } from "./date";

/**
 * Labels for instants (timestamps) in pt-BR, in the user's time zone: last
 * activity, link expiry, audit entries. "now" is always an argument. Like
 * ./date, names come from fixed tables, so server and browser agree.
 */

type Instant = Date | string | number;

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const ms = (at: Instant) => new Date(at).getTime();
const pad = (value: number) => String(value).padStart(2, "0");

/** "14:32". */
export function clockLabel(
  at: Instant,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const zoned = new TZDate(ms(at), timeZone);
  return `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`;
}

/** Calendar date (`YYYY-MM-DD`) of an instant in the time zone. */
export function localDayOf(
  at: Instant,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return iso(localDateIn(ms(at), timeZone));
}

/**
 * How long ago: "agora", "há 5 min", "há 3 h" (same day), "ontem, 14:32",
 * "há 3 dias", then "14/out" or "14/out/25".
 */
export function pastMomentLabel(
  at: Instant,
  now: Instant,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const diff = ms(now) - ms(at);
  if (diff < MINUTE) return "agora";
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  const day = localDayOf(at, timeZone);
  const today = localDayOf(now, timeZone);
  if (day === today) return `há ${Math.floor(diff / HOUR)} h`;
  const label = relativeDayLabel(day, today);
  if (label === "Ontem") return `ontem, ${clockLabel(at, timeZone)}`;
  return label;
}

/**
 * A deadline with its time: "hoje, 14:32", "amanhã, 14:32", "sáb, 20/out,
 * 14:32" (or "ontem, 14:32" once it passed).
 */
export function deadlineLabel(
  at: Instant,
  now: Instant,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const day = localDateIn(ms(at), timeZone);
  const today = localDateIn(ms(now), timeZone);
  const clock = clockLabel(at, timeZone);
  const diff = daysBetween(today, day);
  if (diff === 0) return `hoje, ${clock}`;
  if (diff === 1) return `amanhã, ${clock}`;
  if (diff === -1) return `ontem, ${clock}`;
  return `${WEEKDAYS[dayOfWeek(day)]}, ${shortDateLabel(iso(day))}, ${clock}`;
}
