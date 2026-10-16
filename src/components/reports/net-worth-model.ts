import { formatMoneyShort } from "@/components/charts/format";
import { niceTicks, type Ticks } from "@/components/charts/scale";
import { monthLabel, shortMonthLabel } from "@/lib/format/date";
import type { NetWorthBreakdownPoint } from "@/server/domain/reports";
import type { ReportPeriod } from "./model";

/**
 * View model of Patrimônio (doc 02 §6.12): net worth month by month, assets
 * and liabilities as small multiples, the change over the window. The series
 * starts one month before the window (the change is measured from the end of
 * that month) and its last point is today. Pure.
 */

export type BreakdownKey = "netCents" | "assetsCents" | "liabilitiesCents";

export const BREAKDOWN_LABELS: Record<
  BreakdownKey,
  { title: string; subject: string; plural: boolean }
> = {
  netCents: {
    title: "Patrimônio líquido",
    subject: "Patrimônio",
    plural: false,
  },
  assetsCents: { title: "Ativos", subject: "Ativos", plural: true },
  liabilitiesCents: { title: "Passivos", subject: "Passivos", plural: true },
};

/** "em 12 meses", "no mês". */
export function windowLabel(period: ReportPeriod): string {
  return period === 1 ? "no mês" : `em ${period} meses`;
}

/** Areas grow from zero (doc 02 §9.2). */
export function breakdownTicks(
  values: readonly number[],
  intervals = 4,
): Ticks {
  const finite = values.filter((value) => Number.isFinite(value));
  return niceTicks(Math.min(0, ...finite), Math.max(0, ...finite), intervals);
}

/** "set/25" under the first point, "hoje" under the last one. */
export function breakdownXLabels(
  points: readonly Pick<NetWorthBreakdownPoint, "month">[],
): { position: number; label: string }[] {
  const first = points[0];
  if (!first) return [];
  if (points.length === 1) return [{ position: 0.5, label: "hoje" }];
  return [
    { position: 0, label: shortMonthLabel(first.month) },
    { position: 1, label: "hoje" },
  ];
}

/** Whether a rise is good news: more assets yes, more liabilities no. */
export function deltaTone(
  key: BreakdownKey,
  delta: number,
): "good" | "bad" | "neutral" {
  if (delta === 0) return "neutral";
  const up = delta > 0;
  return key === "liabilitiesCents"
    ? up
      ? "bad"
      : "good"
    : up
      ? "good"
      : "bad";
}

/** "Ativos subiram de R$ 585 mil para R$ 1,3 mi em 12 meses." */
export function breakdownSummary(
  key: BreakdownKey,
  values: readonly number[],
  period: ReportPeriod,
): string {
  const { subject, plural } = BREAKDOWN_LABELS[key];
  const first = values[0];
  const last = values.at(-1);
  if (first === undefined || last === undefined || values.length < 2) {
    return `${subject} ${plural ? "estão" : "está"} em ${formatMoneyShort(last ?? 0)}.`;
  }
  const delta = last - first;
  const verb =
    delta > 0
      ? plural
        ? "subiram"
        : "subiu"
      : delta < 0
        ? plural
          ? "caíram"
          : "caiu"
        : plural
          ? "ficaram estáveis"
          : "ficou estável";
  return delta === 0
    ? `${subject} ${verb} em ${formatMoneyShort(last)} ${windowLabel(period)}.`
    : `${subject} ${verb} de ${formatMoneyShort(first)} para ${formatMoneyShort(last)} ${windowLabel(period)}.`;
}

/** Label of a point: "fim de setembro de 2026", or "hoje" for the last one. */
export function pointLabel(
  points: readonly Pick<NetWorthBreakdownPoint, "month">[],
  index: number,
): string {
  const point = points[index];
  if (!point) return "";
  return index === points.length - 1
    ? "hoje"
    : `fim de ${monthLabel(point.month)}`;
}

/** What the scrub says for a month. */
export function breakdownValueText(
  points: readonly NetWorthBreakdownPoint[],
  index: number,
): string {
  const point = points[index];
  if (!point) return "";
  const when = pointLabel(points, index);
  return `${when.charAt(0).toUpperCase()}${when.slice(1)}: patrimônio ${formatMoneyShort(
    point.netCents,
  )}; ativos ${formatMoneyShort(point.assetsCents)}; passivos ${formatMoneyShort(point.liabilitiesCents)}`;
}
