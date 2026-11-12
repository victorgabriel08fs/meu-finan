import { addDays, dayOfWeek, iso, type LocalDate, parse } from "./dates";
import { assertInteger } from "./guards";

/**
 * Business days of the Brazilian banking calendar (doc 03, "Dias úteis e
 * feriados"): weekends, national holidays (fixed and Easter-based, including
 * Carnival Monday and Tuesday and Corpus Christi, when banks close) and 31/dez,
 * when banks open but run no public service. Ash Wednesday and 24/dez are
 * business days. State and city holidays are not covered.
 */

/** `no_banking`: a day with no banking service that is not a holiday (31/dez). */
export type HolidayKind = "holiday" | "no_banking";

export type Holiday = { date: string; name: string; kind: HolidayKind };

/** Keyed by `YYYY-MM-DD`. */
export type HolidayCalendar = ReadonlyMap<string, Holiday>;

export type NonBusinessReason =
  | "saturday"
  | "sunday"
  | "holiday"
  | "no_banking";

export type NonBusinessDue = {
  reason: NonBusinessReason;
  /** Name of the holiday; null on weekends (a holiday on a Sunday reads "domingo"). */
  holidayName: string | null;
  /** First business day after the due date: when the payment usually goes through. */
  nextBusinessDay: string;
  /** Last business day before the due date: the last day to pay without waiting. */
  previousBusinessDay: string;
};

/** Gregorian Easter (Meeus/Butcher), valid from 1583. */
export const MIN_CALENDAR_YEAR = 1583;
export const MAX_CALENDAR_YEAR = 9999;

/** Weeks never hold more than 4 non-business days in a row; 10 is a safety stop. */
const MAX_STEPS = 10;

/** First day the "Consciência Negra" holiday applies (Lei 14.759/2023). */
const BLACK_CONSCIOUSNESS_SINCE = 2024;

const FIXED: readonly { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "Confraternização Universal" },
  { month: 4, day: 21, name: "Tiradentes" },
  { month: 5, day: 1, name: "Dia do Trabalho" },
  { month: 9, day: 7, name: "Independência do Brasil" },
  { month: 10, day: 12, name: "Nossa Senhora Aparecida" },
  { month: 11, day: 2, name: "Finados" },
  { month: 11, day: 15, name: "Proclamação da República" },
  { month: 11, day: 20, name: "Consciência Negra" },
  { month: 12, day: 25, name: "Natal" },
];

/** Offsets from Easter Sunday. */
const MOVABLE: readonly { offset: number; name: string }[] = [
  { offset: -48, name: "Carnaval" },
  { offset: -47, name: "Carnaval" },
  { offset: -2, name: "Sexta-feira Santa" },
  { offset: 60, name: "Corpus Christi" },
];

function assertCalendarYear(year: number): void {
  assertInteger(year, "year", MIN_CALENDAR_YEAR, MAX_CALENDAR_YEAR);
}

export function easterSunday(year: number): LocalDate {
  assertCalendarYear(year);
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return { year, month: Math.floor(n / 31), day: (n % 31) + 1 };
}

/**
 * Non-business days of `year` in the banking calendar, by date. When two
 * fall on the same day (Good Friday on 21/abr), the first of the list wins:
 * fixed holidays, then the Easter-based ones, then 31/dez.
 */
export function nationalHolidays(year: number): Holiday[] {
  assertCalendarYear(year);
  const byDate = new Map<string, Holiday>();
  const add = (date: LocalDate, name: string, kind: HolidayKind) => {
    const key = iso(date);
    if (!byDate.has(key)) byDate.set(key, { date: key, name, kind });
  };

  for (const { month, day, name } of FIXED) {
    if (month === 11 && day === 20 && year < BLACK_CONSCIOUSNESS_SINCE)
      continue;
    add({ year, month, day }, name, "holiday");
  }
  const easter = easterSunday(year);
  for (const { offset, name } of MOVABLE) {
    add(addDays(easter, offset), name, "holiday");
  }
  add({ year, month: 12, day: 31 }, "Último dia do ano", "no_banking");

  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Calendar of `years` (computed) plus `extra` days, such as the holidays an
 * external source lists. `extra` only adds dates: on a date the computed
 * calendar already has, its name wins.
 */
export function holidayCalendar(
  years: readonly number[],
  extra: readonly Holiday[] = [],
): HolidayCalendar {
  const calendar = new Map<string, Holiday>();
  for (const year of years) {
    for (const holiday of nationalHolidays(year)) {
      calendar.set(holiday.date, holiday);
    }
  }
  for (const holiday of extra) {
    parse(holiday.date);
    if (!calendar.has(holiday.date)) calendar.set(holiday.date, holiday);
  }
  return calendar;
}

/** Why `date` is not a business day, or null when it is. Weekends come first. */
export function nonBusinessReason(
  date: LocalDate,
  calendar: HolidayCalendar,
): NonBusinessReason | null {
  const weekday = dayOfWeek(date);
  if (weekday === 6) return "saturday";
  if (weekday === 0) return "sunday";
  return calendar.get(iso(date))?.kind ?? null;
}

export function isBusinessDay(
  date: LocalDate,
  calendar: HolidayCalendar,
): boolean {
  return nonBusinessReason(date, calendar) === null;
}

function stepToBusinessDay(
  date: LocalDate,
  calendar: HolidayCalendar,
  step: 1 | -1,
): LocalDate {
  let current = date;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    current = addDays(current, step);
    if (isBusinessDay(current, calendar)) return current;
  }
  throw new RangeError(
    `No business day within ${MAX_STEPS} days of ${iso(date)}`,
  );
}

/** First business day strictly after `date`. */
export function nextBusinessDay(
  date: LocalDate,
  calendar: HolidayCalendar,
): LocalDate {
  return stepToBusinessDay(date, calendar, 1);
}

/** Last business day strictly before `date`. */
export function previousBusinessDay(
  date: LocalDate,
  calendar: HolidayCalendar,
): LocalDate {
  return stepToBusinessDay(date, calendar, -1);
}

/** Null when `dueOn` (`YYYY-MM-DD`) is a business day. */
export function nonBusinessDue(
  dueOn: string,
  calendar: HolidayCalendar,
): NonBusinessDue | null {
  const date = parse(dueOn);
  const reason = nonBusinessReason(date, calendar);
  if (reason === null) return null;
  const holidayName =
    reason === "holiday" || reason === "no_banking"
      ? (calendar.get(dueOn)?.name ?? null)
      : null;
  return {
    reason,
    holidayName,
    nextBusinessDay: iso(nextBusinessDay(date, calendar)),
    previousBusinessDay: iso(previousBusinessDay(date, calendar)),
  };
}

/**
 * Years a calendar must cover to answer for `dates` (`YYYY-MM-DD`): each
 * date's year and its neighbours, since 31/dez steps into January and 1/jan
 * back into December. Sorted, without repeats, within the supported range.
 */
export function calendarYearsFor(dates: readonly string[]): number[] {
  const years = new Set<number>();
  for (const value of dates) {
    const { year } = parse(value);
    for (const y of [year - 1, year, year + 1]) {
      if (y >= MIN_CALENDAR_YEAR && y <= MAX_CALENDAR_YEAR) years.add(y);
    }
  }
  return [...years].sort((a, b) => a - b);
}

/**
 * Whether `today` (`YYYY-MM-DD`) falls in the grace days of a bill due on a
 * non-business day: after the due date, up to the next business day, when
 * the payment usually still goes through. The app shows "Prazo até …" then,
 * not "Venceu".
 */
export function isInGrace(
  dueOn: string,
  nb: NonBusinessDue | null | undefined,
  today: string,
): nb is NonBusinessDue {
  return !!nb && dueOn < today && today <= nb.nextBusinessDay;
}
