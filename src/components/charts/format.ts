import { parseMonth } from "@/lib/finance/dates";
import { monthLabel, shortMonthLabel } from "@/lib/format/date";
import { formatBRL, MINUS, NBSP, type SignOptions } from "@/lib/format/money";

/**
 * Short labels for charts and summaries (doc 02 §9.2, §10.1). Amounts are
 * integer cents, as everywhere else.
 */

const compactNumber = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Y-axis tick for an amount: "0", "950", "4 mil", "1,2 mi" (no "R$", §9.2). */
export function axisMoneyLabel(cents: number): string {
  const reais = cents / 100;
  if (!Number.isFinite(reais) || Math.abs(reais) < 0.5) return "0";
  const text = compactNumber.format(Math.abs(reais)).replace(/\s/g, NBSP);
  return reais < 0 ? `${MINUS}${text}` : text;
}

const axisPercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Y-axis tick for a ratio: "0%", "25%", "−12,5%". */
export function axisPercentLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || Math.abs(ratio) < 0.0005) return "0%";
  const text = axisPercent.format(Math.abs(ratio)).replace(/\s/g, NBSP);
  return ratio < 0 ? `${MINUS}${text}` : text;
}

/**
 * "R$ 410" when there are no cents, "R$ 640,50" otherwise: exact, but without
 * the ",00" noise in summaries and budget rows.
 */
export function formatMoneyShort(
  cents: number,
  options: SignOptions = {},
): string {
  const text = formatBRL(cents, options);
  return cents % 100 === 0 ? text.replace(/,00$/, "") : text;
}

/** Whole reais rounded towards zero ("R$ 53 por dia" never overstates). */
export function formatWholeReais(cents: number): string {
  return formatMoneyShort(Math.trunc(cents / 100) * 100);
}

/** "out" for "2026-10" (x-axis labels). */
export function monthAbbrev(month: string): string {
  return shortMonthLabel(month).slice(0, 3);
}

/** "outubro" for "2026-10". */
export function monthName(month: string): string {
  return monthLabel(month).split(" de ")[0] ?? month;
}

/** "ago/2027" for a year-month (goal projections, doc 03 §8). */
export function monthYearLabel(
  value: string | { year: number; month: number },
) {
  const ym = typeof value === "string" ? parseMonth(value) : value;
  const iso = `${String(ym.year).padStart(4, "0")}-${String(ym.month).padStart(2, "0")}`;
  return `${monthAbbrev(iso)}/${ym.year}`;
}

/** "1 mês", "3 meses". */
export function monthsCount(count: number): string {
  return count === 1 ? "1 mês" : `${count} meses`;
}
