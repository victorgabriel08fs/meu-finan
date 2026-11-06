import {
  DEFAULT_REPORT_PERIOD,
  parseReportPeriod,
  periodQuery,
  type ReportPeriod,
} from "./model";

/**
 * The report views (doc 02 §6.12) and the filter each one takes: a window of
 * months (`?periodo=1|3|6|12`) or one financial month (`?mes=YYYY-MM`). Pure.
 */

export type ReportFilter = "period" | "month";

export type ReportView = {
  path: string;
  label: string;
  filter: ReportFilter;
};

export const REPORT_VIEWS: readonly ReportView[] = [
  { path: "/relatorios/visao-geral", label: "Visão geral", filter: "period" },
  { path: "/relatorios/categorias", label: "Categorias", filter: "period" },
  { path: "/relatorios/fluxo", label: "Fluxo", filter: "month" },
  { path: "/relatorios/patrimonio", label: "Patrimônio", filter: "period" },
  { path: "/relatorios/calendario", label: "Calendário", filter: "month" },
];

/** The view on screen (exact path or any path below it), or null. */
export function reportViewAt(pathname: string): ReportView | null {
  return (
    REPORT_VIEWS.find(
      (view) => pathname === view.path || pathname.startsWith(`${view.path}/`),
    ) ?? null
  );
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?mes=` when it is a well-formed `YYYY-MM`, otherwise null. */
export function parseMonthParam(
  value: string | string[] | undefined | null,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && MONTH.test(raw) ? raw : null;
}

/**
 * `?mes=` of a report that takes a window of months: the month where the
 * window ends. Never past the current month (the future has no data), and a
 * malformed value means today's month. Pure.
 */
export function clampReportMonth(
  month: string | null,
  currentMonth: string,
): string {
  return month && month < currentMonth ? month : currentMonth;
}

/**
 * Path of a period view with its filters: `?periodo=` (left out at the
 * default 12) and `?mes=` (the month the window ends at, when there is one).
 */
export function periodHref(
  path: string,
  period: ReportPeriod,
  month: string | null,
): string {
  const query = periodQuery(period);
  if (!month) return `${path}${query}`;
  return `${path}${query ? `${query}&` : "?"}mes=${month}`;
}

/**
 * Link of a block or a notice to a period view ending at `endMonth`: always
 * says the window (`?periodo=`), and leaves `?mes=` out for the current
 * month, so the plain link means "now".
 */
export function periodViewHref(
  path: string,
  period: ReportPeriod,
  endMonth: string,
  currentMonth: string,
): string {
  const base = `${path}?periodo=${period}`;
  return endMonth === currentMonth ? base : `${base}&mes=${endMonth}`;
}

/**
 * Link of a tab: both kinds keep `?mes=`, period views also keep `?periodo=`,
 * so moving between views keeps the filter.
 */
export function reportViewHref(
  view: ReportView,
  current: { periodo?: string | null; mes?: string | null },
): string {
  const month = parseMonthParam(current.mes);
  if (view.filter === "period") {
    const period: ReportPeriod = current.periodo
      ? parseReportPeriod(current.periodo)
      : DEFAULT_REPORT_PERIOD;
    return periodHref(view.path, period, month);
  }
  return month ? `${view.path}?mes=${month}` : view.path;
}

/**
 * Link to a month of a month view: the current month is left out, so the
 * plain path always means "now" (as in the statement).
 */
export function monthViewHref(
  path: string,
  month: string,
  currentMonth: string,
): string {
  return month === currentMonth ? path : `${path}?mes=${month}`;
}
