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
 * Link of a tab: period views keep `?periodo=`, month views keep `?mes=`,
 * so moving between views of the same kind keeps the filter.
 */
export function reportViewHref(
  view: ReportView,
  current: { periodo?: string | null; mes?: string | null },
): string {
  if (view.filter === "period") {
    const period: ReportPeriod = current.periodo
      ? parseReportPeriod(current.periodo)
      : DEFAULT_REPORT_PERIOD;
    return `${view.path}${periodQuery(period)}`;
  }
  const month = parseMonthParam(current.mes);
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
