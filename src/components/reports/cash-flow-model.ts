import { formatMoneyShort } from "@/components/charts/format";
import { balanceTicks } from "@/components/charts/range-ticks";
import { type Ticks, topPercent } from "@/components/charts/scale";
import { shortDateLabel } from "@/lib/format/date";
import type {
  CashFlowDayPoint,
  CashFlowReport,
  CashFlowScheduledItem,
} from "@/server/domain/reports";
import { dayMonthLabel } from "./day-labels";

/**
 * View model of Fluxo de caixa (doc 02 §6.12): which points get a marker,
 * the axis, the labels under the plot, the tone of the lowest balance and
 * the spoken descriptions. Pure.
 */

export type CashFlowMarker = {
  index: number;
  value: number;
  label: string;
  placement: "above" | "below";
};

/** "Fatura Cartão Principal" → "Fatura Cartão…": short direct labels (§9.3). */
export function shortLabel(text: string, max = 14): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const head = space >= 6 ? cut.slice(0, space) : cut.slice(0, max - 1);
  return `${head.trimEnd()}…`;
}

/**
 * Up to `max` markers on the biggest scheduled items, by size, one per day
 * (named after that day's largest item). Outflows label below the point (the
 * line comes down into it), inflows above — flipped near the edges of the
 * plot. Labels on the same side stay about a sixth of the month apart, so
 * they never run into each other; a smaller item that would crowd them is
 * left to the list and the table.
 */
export function pickMarkers(
  days: readonly CashFlowDayPoint[],
  scheduled: readonly CashFlowScheduledItem[],
  ticks: Pick<Ticks, "min" | "max">,
  max = 3,
): CashFlowMarker[] {
  const indexOf = new Map(days.map((day, index) => [day.date, index]));
  const largest = new Map<string, CashFlowScheduledItem>();
  for (const item of scheduled) {
    const current = largest.get(item.date);
    if (
      !current ||
      Math.abs(item.amountCents) > Math.abs(current.amountCents)
    ) {
      largest.set(item.date, item);
    }
  }
  const candidates = [...largest.values()].sort(
    (a, b) =>
      Math.abs(b.amountCents) - Math.abs(a.amountCents) ||
      a.date.localeCompare(b.date),
  );
  const sameSideGap = Math.max(2, Math.ceil(days.length / 6));
  const chosen: CashFlowMarker[] = [];
  for (const item of candidates) {
    if (chosen.length >= max) break;
    const index = indexOf.get(item.date);
    const value = index === undefined ? null : days[index]?.projectedCents;
    if (index === undefined || value === null || value === undefined) continue;
    const top = topPercent(value, ticks);
    let placement: CashFlowMarker["placement"] =
      item.amountCents < 0 ? "below" : "above";
    if (placement === "below" && top > 72) placement = "above";
    else if (placement === "above" && top < 28) placement = "below";
    const crowded = chosen.some((marker) => {
      const gap = Math.abs(marker.index - index);
      return gap < 2 || (marker.placement === placement && gap < sameSideGap);
    });
    if (crowded) continue;
    chosen.push({ index, value, label: shortLabel(item.label), placement });
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/** Every balance on the chart (realized and projected). */
function chartValues(days: readonly CashFlowDayPoint[]): number[] {
  return days.flatMap((day) =>
    [day.realizedCents, day.projectedCents].filter(
      (value): value is number => value !== null,
    ),
  );
}

/** From zero when the balance comes near it, zoomed in otherwise. */
export function cashFlowTicks(days: readonly CashFlowDayPoint[]): Ticks {
  return balanceTicks(chartValues(days), 4);
}

/** First day, last day and "hoje" under the plot, dropping any that would collide. */
export function cashFlowXLabels(
  days: readonly CashFlowDayPoint[],
  today: string,
): { position: number; label: string }[] {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return [];
  const span = Math.max(1, days.length - 1);
  const todayIndex = days.findIndex((day) => day.date === today);
  const labels: { position: number; label: string }[] = [];
  const near = (position: number) =>
    todayIndex !== -1 && Math.abs(position - todayIndex / span) < 0.16;
  if (!near(0)) labels.push({ position: 0, label: shortDateLabel(first.date) });
  if (todayIndex !== -1) {
    labels.push({
      position: days.length === 1 ? 0.5 : todayIndex / span,
      label: "hoje",
    });
  }
  if (days.length > 1 && !near(1)) {
    labels.push({ position: 1, label: shortDateLabel(last.date) });
  }
  return labels;
}

/** Selected by default: today in the current month, otherwise the last day. */
export function defaultCashFlowIndex(
  days: readonly CashFlowDayPoint[],
  today: string,
): number {
  const index = days.findIndex((day) => day.date === today);
  return index === -1 ? Math.max(0, days.length - 1) : index;
}

export type LowestTone = "warning" | "danger" | null;

/**
 * A balance that goes negative is flagged (doc 02 §3.3 status colors):
 * --danger when the month also ends below zero, --warning for a dip.
 */
export function lowestTone(
  report: Pick<
    CashFlowReport,
    "phase" | "lowestRealized" | "lowestProjected" | "endCents"
  >,
): LowestTone {
  const low =
    report.phase === "past" ? report.lowestRealized : report.lowestProjected;
  if (!low || low.cents >= 0) return null;
  return report.endCents < 0 ? "danger" : "warning";
}

/** Spoken summary of the chart. */
export function cashFlowSummary(
  report: Pick<
    CashFlowReport,
    | "phase"
    | "days"
    | "startCents"
    | "endCents"
    | "lowestRealized"
    | "lowestProjected"
  >,
  today: string,
): string {
  const last = report.days.at(-1);
  if (!last) return "Sem saldo para mostrar.";
  const end = shortDateLabel(last.date);
  if (report.phase === "past") {
    const low = report.lowestRealized;
    return `Saldo começou o mês em ${formatMoneyShort(report.startCents)} e fechou em ${formatMoneyShort(
      report.endCents,
    )} em ${end}${low ? `; menor saldo ${formatMoneyShort(low.cents)} em ${shortDateLabel(low.date)}` : ""}.`;
  }
  const low = report.lowestProjected;
  const lowText = low
    ? `; menor saldo previsto ${formatMoneyShort(low.cents)} em ${shortDateLabel(low.date)}`
    : "";
  if (report.phase === "future") {
    return `Previsão: começa em ${formatMoneyShort(report.startCents)} e termina em ${formatMoneyShort(
      report.endCents,
    )} em ${end}${lowText}.`;
  }
  const now = report.days.find((day) => day.date === today);
  const nowText =
    now?.realizedCents === null || now?.realizedCents === undefined
      ? ""
      : `Saldo de ${formatMoneyShort(now.realizedCents)} hoje; `;
  return `${nowText}previsto ${formatMoneyShort(report.endCents)} em ${end}${lowText}.`;
}

/** What the scrub says for a day ("25 de outubro: saldo previsto R$ 1.234"). */
export function cashFlowValueText(
  day: CashFlowDayPoint | undefined,
  today: string,
): string {
  if (!day) return "";
  const date = dayMonthLabel(day.date);
  if (day.date === today && day.realizedCents !== null) {
    const projected =
      day.projectedCents !== null && day.projectedCents !== day.realizedCents
        ? `; com os atrasados, ${formatMoneyShort(day.projectedCents)}`
        : "";
    return `${date}, hoje: saldo ${formatMoneyShort(day.realizedCents)}${projected}`;
  }
  if (day.realizedCents !== null) {
    return `${date}: saldo ${formatMoneyShort(day.realizedCents)}`;
  }
  return `${date}: saldo previsto ${formatMoneyShort(day.projectedCents ?? 0)}`;
}
