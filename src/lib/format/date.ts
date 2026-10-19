import {
  DEFAULT_TIME_ZONE,
  dayOfWeek,
  daysBetween,
  iso,
  type LocalDate,
  localDateIn,
  parse,
  parseMonth,
} from "@/lib/finance/dates";

/**
 * Date labels in pt-BR (doc 02 §10.1). Inputs are ISO strings (`YYYY-MM-DD`,
 * `YYYY-MM`) and "today" is always an argument; only `todayInTimeZone` reads
 * the clock. Names come from fixed tables, not from the runtime's ICU data, so
 * the output is the same on the server and in every browser.
 */

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** "jan", "fev", … "dez". */
const SHORT_MONTHS = MONTHS.map((name) => name.slice(0, 3));

/** Indexed by `dayOfWeek` (0 = Sunday). */
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

const MIDDLE_DOT = "·";
const EN_DASH = "–";

const twoDigitYear = (year: number) => String(year % 100).padStart(2, "0");

function shortDate(date: LocalDate, withYear = false): string {
  const label = `${date.day}/${SHORT_MONTHS[date.month - 1]}`;
  return withYear ? `${label}/${twoDigitYear(date.year)}` : label;
}

function nearbyDayWord(daysFromToday: number): string | null {
  if (daysFromToday === 0) return "Hoje";
  if (daysFromToday === -1) return "Ontem";
  if (daysFromToday === 1) return "Amanhã";
  return null;
}

/** "14/out" (data curta); "14/out/25" with `withYear`. */
export function shortDateLabel(date: string, withYear = false): string {
  return shortDate(parse(date), withYear);
}

/** "14 de outubro de 2026" (data completa); the first day is "1º de março de 2026". */
export function fullDateLabel(date: string): string {
  const d = parse(date);
  const day = d.day === 1 ? "1º" : String(d.day);
  return `${day} de ${MONTHS[d.month - 1]} de ${d.year}`;
}

/**
 * "Hoje", "Ontem", "Amanhã", "em 3 dias", "há 2 dias" up to 6 days away;
 * otherwise "14/out", or "14/out/25" in a year other than today's.
 */
export function relativeDayLabel(date: string, today: string): string {
  const d = parse(date);
  const t = parse(today);
  const diff = daysBetween(t, d);
  const word = nearbyDayWord(diff);
  if (word) return word;
  if (diff > 0 && diff <= 6) return `em ${diff} dias`;
  if (diff < 0 && diff >= -6) return `há ${-diff} dias`;
  return shortDate(d, d.year !== t.year);
}

/**
 * Day header of the statement: "Hoje · ter, 14 out", "Ontem · seg, 13 out",
 * "Amanhã · qua, 15 out" or just "sáb, 11 out"; the year is added when it is
 * not today's year ("qua, 31 dez 2025").
 */
export function dayHeaderLabel(date: string, today: string): string {
  const d = parse(date);
  const t = parse(today);
  const year = d.year === t.year ? "" : ` ${d.year}`;
  const label = `${WEEKDAYS[dayOfWeek(d)]}, ${d.day} ${SHORT_MONTHS[d.month - 1]}${year}`;
  const word = nearbyDayWord(daysBetween(t, d));
  return word ? `${word} ${MIDDLE_DOT} ${label}` : label;
}

/** "outubro de 2026" for "2026-10". */
export function monthLabel(month: string): string {
  const m = parseMonth(month);
  return `${MONTHS[m.month - 1]} de ${m.year}`;
}

/** "out/26" for "2026-10". */
export function shortMonthLabel(month: string): string {
  const m = parseMonth(month);
  return `${SHORT_MONTHS[m.month - 1]}/${twoDigitYear(m.year)}`;
}

/** "5/out – 4/nov": a financial month, both ends included. */
export function periodLabel(start: string, end: string): string {
  const s = parse(start);
  const e = parse(end);
  if (daysBetween(s, e) < 0) {
    throw new RangeError(`end must not be before start (${start} – ${end})`);
  }
  return `${shortDate(s)} ${EN_DASH} ${shortDate(e)}`;
}

/** "7 anos e 3 meses", "1 ano", "1 mês", "0 meses" (prazo). */
export function durationLabel(months: number): string {
  if (!Number.isSafeInteger(months) || months < 0) {
    throw new RangeError(
      `months must be a non-negative integer (received ${String(months)})`,
    );
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsText = years === 1 ? "1 ano" : `${years} anos`;
  const monthsText = rest === 1 ? "1 mês" : `${rest} meses`;
  if (years === 0) return monthsText;
  return rest === 0 ? yearsText : `${yearsText} e ${monthsText}`;
}

/**
 * Today's date (`YYYY-MM-DD`) in `timeZone`, an IANA name such as the user's
 * `user_settings.timezone`. The only function here that reads the clock: call
 * it at the edge and pass the result down as `today`.
 */
export function todayInTimeZone(timeZone: string = DEFAULT_TIME_ZONE): string {
  return iso(localDateIn(Date.now(), timeZone));
}
