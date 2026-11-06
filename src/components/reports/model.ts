import {
  monthAbbrev,
  monthName,
  monthsCount,
  type SpokenOptions,
  spokenMoney,
} from "@/components/charts/format";
import { daysBetween, parse, periodDays } from "@/lib/finance";
import { monthLabel, shortMonthLabel } from "@/lib/format/date";
import { formatPercent } from "@/lib/format/number";
import { windowLabel } from "./net-worth-model";

/**
 * Reports view model (doc 02 §6.12): the period filter, KPI sums (with the
 * partial month) and ratios (complete months only), chart series and the
 * spoken summaries of each chart. Pure.
 */

export const REPORT_PERIODS = [1, 3, 6, 12] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const DEFAULT_REPORT_PERIOD: ReportPeriod = 12;

export const PERIOD_LABELS: Record<
  ReportPeriod,
  { short: string; long: string }
> = {
  1: { short: "Mês", long: "Este mês" },
  3: { short: "3M", long: "3 meses" },
  6: { short: "6M", long: "6 meses" },
  12: { short: "12M", long: "12 meses" },
};

/** `?periodo=` → months; anything else is the default (12). */
export function parseReportPeriod(
  value: string | string[] | undefined | null,
): ReportPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  const number = Number(raw);
  return (REPORT_PERIODS as readonly number[]).includes(number)
    ? (number as ReportPeriod)
    : DEFAULT_REPORT_PERIOD;
}

/** Query string that keeps the period across tabs ("" for the default). */
export function periodQuery(period: ReportPeriod): string {
  return period === DEFAULT_REPORT_PERIOD ? "" : `?periodo=${period}`;
}

export type MonthTotals = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  partial: boolean;
};

export function sumTotals(series: readonly MonthTotals[]) {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const point of series) {
    incomeCents += point.incomeCents;
    expenseCents += point.expenseCents;
  }
  const partial = series.find((point) => point.partial);
  return {
    incomeCents,
    expenseCents,
    /** "inclui out parcial" — sums include the running month (doc 02 §6.12). */
    partialCaption: partial
      ? `inclui ${monthAbbrev(partial.month)} parcial`
      : null,
  };
}

/** Month selected by default: the last complete one (the partial one only if alone). */
export function defaultSelectedMonth(
  series: readonly MonthTotals[],
): number | null {
  if (series.length === 0) return null;
  for (let index = series.length - 1; index >= 0; index--) {
    if (!series[index]?.partial) return index;
  }
  return series.length - 1;
}

/**
 * "até o dia 14 de 31": how far the running period went, for the footnote
 * of a partial month; null when the series has none. `current` is the period
 * containing today (the only one a series marks partial), whatever day the
 * person's month starts on.
 */
export function partialProgress(
  series: readonly Pick<MonthTotals, "partial">[],
  current: { start: string; end: string },
  todayIso: string,
): string | null {
  if (!series.some((point) => point.partial)) return null;
  const start = parse(current.start);
  const elapsed = daysBetween(start, parse(todayIso)) + 1;
  const total = periodDays({ start, end: parse(current.end) });
  return `até o dia ${elapsed} de ${total}`;
}

/**
 * "Receitas superaram as despesas em 11 de 12 meses; maior despesa em
 * dezembro, R$ 8.940. Outubro está parcial." In privacy mode the amount
 * reads "valor oculto".
 */
export function incomeExpenseSummary(
  series: readonly MonthTotals[],
  options: SpokenOptions = {},
): string {
  if (series.length === 0) return "Sem lançamentos no período.";
  const ahead = series.filter(
    (point) => point.incomeCents > point.expenseCents,
  ).length;
  let peak = series[0] as MonthTotals;
  for (const point of series)
    if (point.expenseCents > peak.expenseCents) peak = point;
  const parts = [
    series.length === 1
      ? ahead === 1
        ? "Receitas acima das despesas no mês"
        : "Despesas iguais ou acima das receitas no mês"
      : ahead === series.length
        ? `Receitas superaram as despesas em todos os ${series.length} meses`
        : `Receitas superaram as despesas em ${ahead} de ${series.length} meses`,
  ];
  if (peak.expenseCents > 0 && series.length > 1) {
    parts[0] += `; maior despesa em ${monthName(peak.month)}, ${spokenMoney(peak.expenseCents, options)}`;
  }
  const partial = series.find((point) => point.partial);
  const tail = partial
    ? ` ${monthName(partial.month).replace(/^./, (letter) => letter.toUpperCase())} está parcial.`
    : "";
  return `${parts[0]}.${tail}`;
}

/**
 * Name of a month's column: "setembro de 2026: receitas R$ 8.700, despesas
 * R$ 6.020", the running month "(parcial)"; "valor oculto" in privacy mode.
 */
export function incomeExpenseMonthLabel(
  point: MonthTotals,
  options: SpokenOptions = {},
): string {
  return `${monthLabel(point.month)}${point.partial ? " (parcial)" : ""}: receitas ${spokenMoney(
    point.incomeCents,
    options,
  )}, despesas ${spokenMoney(point.expenseCents, options)}`;
}

/** Savings rate of one month, or null without income (and for the partial month). */
export function monthSavingsRate(point: MonthTotals): number | null {
  if (point.partial || point.incomeCents <= 0) return null;
  return (point.incomeCents - point.expenseCents) / point.incomeCents;
}

/** Points worth a direct label: the peak, the low and the last value (doc 02 §9.3). */
export function highlightIndices(values: readonly (number | null)[]): number[] {
  let peak = -1;
  let low = -1;
  let last = -1;
  values.forEach((value, index) => {
    if (value === null) return;
    if (peak === -1 || value > (values[peak] as number)) peak = index;
    if (low === -1 || value < (values[low] as number)) low = index;
    last = index;
  });
  return [...new Set([peak, low, last])]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
}

/** "Taxa de poupança entre 6,4% (jul) e 43,6% (dez); setembro fechou em 30,8%." */
export function savingsSummary(
  months: readonly string[],
  rates: readonly (number | null)[],
): string {
  const marks = rates
    .map((rate, index) => ({ rate, month: months[index] ?? "" }))
    .filter(
      (mark): mark is { rate: number; month: string } => mark.rate !== null,
    );
  if (marks.length === 0) return "Sem meses completos com receita no período.";
  const last = marks.at(-1) as { rate: number; month: string };
  if (marks.length === 1) {
    return `Taxa de poupança de ${formatPercent(last.rate)} em ${monthName(last.month)}.`;
  }
  let high = marks[0] as { rate: number; month: string };
  let low = high;
  for (const mark of marks) {
    if (mark.rate > high.rate) high = mark;
    if (mark.rate < low.rate) low = mark;
  }
  return `Taxa de poupança entre ${formatPercent(low.rate)} (${monthName(low.month)}) e ${formatPercent(
    high.rate,
  )} (${monthName(high.month)}); ${monthName(last.month)} fechou em ${formatPercent(last.rate)}.`;
}

/** Caption of the savings KPI: which complete months it covers. */
export function savingsCaption(input: {
  monthsCounted: number;
  from: { year: number; month: number } | null;
  to: { year: number; month: number } | null;
}): string {
  if (input.monthsCounted === 0 || !input.from || !input.to)
    return "aguarda um mês completo";
  const iso = (ym: { year: number; month: number }) =>
    `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  if (input.monthsCounted === 1)
    return `${shortMonthLabel(iso(input.to))}, mês completo`;
  return `${monthsCount(input.monthsCounted)} completos, ${shortMonthLabel(iso(input.from))}–${shortMonthLabel(iso(input.to))}`;
}

/** Net worth change over the window: the series starts one month before it. */
export function netWorthChange(values: readonly number[]) {
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  return { first, last, delta: last - first };
}

/**
 * "Patrimônio subiu de R$ 16.480 para R$ 26.290 em 12 meses", or "Patrimônio
 * ficou estável em R$ 16.480 no mês" with no change; "valor oculto" in
 * privacy mode.
 */
export function netWorthSummary(
  values: readonly number[],
  period: number,
  options: SpokenOptions = {},
): string {
  if (values.length < 2) return "Patrimônio líquido no período.";
  const { first, last, delta } = netWorthChange(values);
  // No change: "de X para X" says nothing, so it reads "ficou estável em X".
  if (delta === 0) {
    return `Patrimônio ficou estável em ${spokenMoney(last, options)} ${windowLabel(period)}.`;
  }
  const verb = delta > 0 ? "subiu" : "caiu";
  return `Patrimônio ${verb} de ${spokenMoney(first, options)} para ${spokenMoney(last, options)} em ${
    period === 1 ? "1 mês" : `${period} meses`
  }.`;
}
