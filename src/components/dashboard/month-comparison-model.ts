import type { Change } from "@/lib/finance";
import { periodLabel, shortDateLabel } from "@/lib/format/date";
import { formatPercent } from "@/lib/format/number";
import type { MonthComparison } from "@/server/domain/month-comparison";

/**
 * Pure pt-BR texts of Comparado ao mês passado (doc 02 §6.3, §10). Month
 * names come in already formatted ("novembro", "outubro"); amounts are never
 * written here, they render through `Money` so the discreet mode masks them.
 */

/** "Despesas pagas até hoje, contra 1/out – 14/out". */
export function comparisonCaption(
  comparison: Pick<MonthComparison, "complete" | "previous">,
  monthName: string,
  previousMonthName: string,
): string {
  return comparison.complete
    ? `Despesas pagas em ${monthName}, contra ${previousMonthName} inteiro`
    : `Despesas pagas até hoje, contra ${periodLabel(comparison.previous.start, comparison.previous.end)}`;
}

export type TotalChangeParts = {
  kind: "up" | "down" | "same" | "no-baseline";
  /** "+17,5%" (shown in parentheses), or null when there is no amount. */
  percent: string | null;
  /**
   * Up and down: what follows the amount (" a mais que em outubro"). Same
   * and no baseline: the whole text, without an amount.
   */
  suffix: string;
};

/** The chip of the total: "{R$ 230,00} a mais que em outubro (+17,5%)". */
export function totalChangeParts(
  total: Change,
  previousMonthName: string,
  complete: boolean,
): TotalChangeParts {
  if (total.ratio === null) {
    return {
      kind: "no-baseline",
      percent: null,
      suffix: complete
        ? `Sem despesas pagas em ${previousMonthName}`
        : `Sem despesas pagas em ${previousMonthName} até esse ponto`,
    };
  }
  if (total.direction === "same") {
    return {
      kind: "same",
      percent: null,
      suffix: `Igual a ${previousMonthName}`,
    };
  }
  return {
    kind: total.direction,
    percent: formatPercent(total.ratio, { sign: "always" }),
    suffix: ` ${directionWords(total.direction)} que em ${previousMonthName}`,
  };
}

/**
 * What comes before the previous month's amount: "Em outubro, até 14/out:"
 * or, whole months, "Em outubro:". Null without a baseline (the line goes).
 */
export function previousLine(
  comparison: Pick<MonthComparison, "complete" | "previous" | "total">,
  previousMonthName: string,
): string | null {
  if (comparison.total.baselineCents === 0) return null;
  return comparison.complete
    ? `Em ${previousMonthName}:`
    : `Em ${previousMonthName}, até ${shortDateLabel(comparison.previous.end)}:`;
}

/** "+60,0%" / "−40,0%", or "Nova no mês" when nothing was spent before. */
export function categoryPercentLabel(item: Change): string {
  return item.ratio === null
    ? "Nova no mês"
    : formatPercent(item.ratio, { sign: "always" });
}

/** Read after a category's difference: " a mais que em outubro". */
export function categoryDirectionHint(
  item: Change,
  previousMonthName: string,
): string {
  return item.direction === "same"
    ? ` igual a ${previousMonthName}`
    : ` ${directionWords(item.direction)} que em ${previousMonthName}`;
}

function directionWords(direction: "up" | "down") {
  return direction === "up" ? "a mais" : "a menos";
}
