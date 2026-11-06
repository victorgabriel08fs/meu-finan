import { type SpokenOptions, spokenMoney } from "@/components/charts/format";
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

/** Words that cannot end a label: "Mensalidade da…" says nothing. */
const LINKING_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "a",
  "o",
  "as",
  "os",
  "para",
  "com",
  "por",
]);

/**
 * "Fatura Cartão Principal" → "Fatura Cartão…": short direct labels (§9.3).
 * Cuts at a word, and never leaves a linking word at the end ("Mensalidade
 * da faculdade" → "Mensalidade…"); a first word longer than the room is cut
 * in the middle of the word.
 */
export function shortLabel(text: string, max = 16): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space < 6) return `${cut.slice(0, max - 1).trimEnd()}…`;
  const words = cut.slice(0, space).split(" ");
  while (words.length > 1 && LINKING_WORDS.has(words.at(-1) ?? "")) {
    words.pop();
  }
  const head = words.join(" ");
  return `${(head.length >= 6 ? head : cut.slice(0, max - 1)).trimEnd()}…`;
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

/**
 * Nothing to draw: no paid entry, nothing scheduled and every balance at
 * zero (a month before the first entry, or accounts that never moved).
 */
export function isCashFlowEmpty(
  report: Pick<CashFlowReport, "paidCount" | "scheduled" | "days">,
): boolean {
  return (
    report.paidCount === 0 &&
    report.scheduled.length === 0 &&
    report.days.every(
      (day) =>
        (day.realizedCents ?? 0) === 0 && (day.projectedCents ?? 0) === 0,
    )
  );
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

/** Spoken summary of the chart; in privacy mode the amounts read "valor oculto". */
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
  options: SpokenOptions = {},
): string {
  const money = (cents: number) => spokenMoney(cents, options);
  const last = report.days.at(-1);
  if (!last) return "Sem saldo para mostrar.";
  const end = shortDateLabel(last.date);
  if (report.phase === "past") {
    const low = report.lowestRealized;
    return `Saldo começou o mês em ${money(report.startCents)} e fechou em ${money(
      report.endCents,
    )} em ${end}${low ? `; menor saldo ${money(low.cents)} em ${shortDateLabel(low.date)}` : ""}.`;
  }
  const low = report.lowestProjected;
  const lowText = low
    ? `; menor saldo previsto ${money(low.cents)} em ${shortDateLabel(low.date)}`
    : "";
  if (report.phase === "future") {
    return `Previsão: começa em ${money(report.startCents)} e termina em ${money(
      report.endCents,
    )} em ${end}${lowText}.`;
  }
  const now = report.days.find((day) => day.date === today);
  const nowText =
    now?.realizedCents === null || now?.realizedCents === undefined
      ? ""
      : `Saldo de ${money(now.realizedCents)} hoje; `;
  return `${nowText}previsto ${money(report.endCents)} em ${end}${lowText}.`;
}

/**
 * What the scrub says for a day ("25 de outubro: saldo previsto R$ 1.234");
 * "valor oculto" in privacy mode.
 */
export function cashFlowValueText(
  day: CashFlowDayPoint | undefined,
  today: string,
  options: SpokenOptions = {},
): string {
  if (!day) return "";
  const money = (cents: number) => spokenMoney(cents, options);
  const date = dayMonthLabel(day.date);
  if (day.date === today && day.realizedCents !== null) {
    const projected =
      day.projectedCents !== null && day.projectedCents !== day.realizedCents
        ? `; com os atrasados, ${money(day.projectedCents)}`
        : "";
    return `${date}, hoje: saldo ${money(day.realizedCents)}${projected}`;
  }
  if (day.realizedCents !== null) {
    return `${date}: saldo ${money(day.realizedCents)}`;
  }
  return `${date}: saldo previsto ${money(day.projectedCents ?? 0)}`;
}
