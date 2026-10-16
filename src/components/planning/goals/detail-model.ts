import { monthYearLabel } from "@/components/charts/format";
import { spokenAmount } from "@/components/money/money";
import {
  addMonths,
  centsToReais,
  type GoalProjection,
  isoMonth,
  monthsBetween,
  parseMonth,
  reaisToCents,
  simulate,
  type YearMonth,
} from "@/lib/finance";
import { monthLabel, shortDateLabel, shortMonthLabel } from "@/lib/format/date";
import { brlParts, formatBRL } from "@/lib/format/money";

/**
 * Goal detail logic (doc 02 §6.10, doc 03 §8): the projection chart month by
 * month, its table twin and the texts read aloud. The balances come from the
 * finance engine (`simulate`, the same compounding as `projectGoal`); this
 * module only chooses the horizon and lays the points out. Pure.
 */

/** A month of the linked account's history, as the server sends it (goalContributions). */
export type GoalHistoryMonth = {
  /** `YYYY-MM`. */
  month: string;
  contributionCents: number;
  balanceCents: number;
};

export type ChartPointKind = "history" | "today" | "projection";

export type ChartPoint = {
  /** `YYYY-MM`. */
  month: string;
  /** Months from the first month of the axis. */
  offset: number;
  kind: ChartPointKind;
  balanceCents: number;
  /**
   * Money put in that month: received (a past month, or this month on a
   * linked goal) or planned (projection). Null when unknown or none planned.
   */
  contributionCents: number | null;
};

export type GoalChartModel = {
  /** Past months with contributions (dots), today, then one point per projected month. */
  points: ChartPoint[];
  /** Months from the first to the last point (at least 1). */
  span: number;
  todayIndex: number;
  /** Point where the projection reaches the target, when it does on the axis. */
  reachedIndex: number | null;
  /** Offset of the deadline when it falls after today, within the axis. */
  deadlineOffset: number | null;
  targetCents: number;
  /** Highest value drawn, the target included (top of the value axis). */
  maxCents: number;
};

export type GoalChartInput = {
  today: YearMonth;
  currentCents: number;
  targetCents: number;
  monthlyPlanCents: number;
  /** Expected monthly rate (0 without yield), as the server computed it. */
  monthlyRate: number;
  deadline: YearMonth | null;
  projection: GoalProjection;
  /** Linked goals only (empty otherwise), oldest first, ending with this month. */
  history: readonly GoalHistoryMonth[];
  /** With a linked account the contributions are known (the ledger). */
  linked: boolean;
};

/** Without a date to reach (no plan and no deadline): a year at the current pace. */
export const DEFAULT_PROJECTION_MONTHS = 12;
/** Fifty years, the simulator's longest term. */
export const MAX_PROJECTION_MONTHS = 600;

/**
 * Months to project: until the goal is reached; otherwise until the deadline
 * (when it is still ahead); otherwise a year.
 */
export function projectionMonths(
  input: Pick<GoalChartInput, "today" | "deadline" | "projection">,
): number {
  const { today, deadline, projection } = input;
  const until =
    projection.eta ??
    (deadline && monthsBetween(today, deadline) > 0 ? deadline : null);
  const months = until
    ? monthsBetween(today, until)
    : DEFAULT_PROJECTION_MONTHS;
  return Math.min(MAX_PROJECTION_MONTHS, Math.max(1, months));
}

/** Projections are estimates: whole reais. */
const wholeReais = (cents: number) => Math.round(cents / 100) * 100;

export function goalChart(input: GoalChartInput): GoalChartModel {
  const { today, deadline, projection, history } = input;
  const months = projectionMonths(input);
  const { series } = simulate({
    initial: centsToReais(input.currentCents),
    monthly: centsToReais(input.monthlyPlanCents),
    months,
    rate: { kind: "monthly", value: input.monthlyRate },
  });

  const currentMonth = isoMonth(today);
  // The current month is today's point; dots are the months before it.
  const past = history.filter(
    (item) => item.month < currentMonth && item.contributionCents > 0,
  );
  const first = past[0] ? parseMonth(past[0].month) : today;
  const lead = monthsBetween(first, today);

  const points: ChartPoint[] = past.map((item) => ({
    month: item.month,
    offset: monthsBetween(first, parseMonth(item.month)),
    kind: "history",
    balanceCents: item.balanceCents,
    contributionCents: item.contributionCents,
  }));
  const todayIndex = points.length;
  points.push({
    month: currentMonth,
    offset: lead,
    kind: "today",
    balanceCents: input.currentCents,
    contributionCents: input.linked
      ? (history.find((item) => item.month === currentMonth)
          ?.contributionCents ?? 0)
      : null,
  });
  for (const point of series.slice(1)) {
    points.push({
      month: isoMonth(addMonths(today, point.month)),
      offset: lead + point.month,
      kind: "projection",
      balanceCents: wholeReais(reaisToCents(point.balance)),
      contributionCents:
        input.monthlyPlanCents > 0 ? input.monthlyPlanCents : null,
    });
  }

  const eta = projection.eta ? isoMonth(projection.eta) : null;
  const reached = eta
    ? points.findIndex(
        (point) => point.kind === "projection" && point.month === eta,
      )
    : -1;
  const toDeadline = deadline ? monthsBetween(today, deadline) : null;
  return {
    points,
    span: lead + months,
    todayIndex,
    reachedIndex: reached === -1 ? null : reached,
    deadlineOffset:
      toDeadline !== null && toDeadline > 0 && toDeadline <= months
        ? lead + toDeadline
        : null,
    targetCents: input.targetCents,
    maxCents: points.reduce(
      (max, point) => Math.max(max, point.balanceCents),
      input.targetCents,
    ),
  };
}

/** Projected months shown one by one in the table; beyond that, one a year. */
const TABLE_MONTHLY_LIMIT = 24;

/**
 * The table twin (doc 02 §9.5): every past contribution, today, then the
 * projection month by month — or year by year (and the last month) when it
 * runs longer than two years.
 */
export function tableRows(model: GoalChartModel): ChartPoint[] {
  const projected = model.points.filter((point) => point.kind === "projection");
  const sampled =
    projected.length <= TABLE_MONTHLY_LIMIT
      ? projected
      : projected.filter(
          (_, index) =>
            (index + 1) % 12 === 0 || index === projected.length - 1,
        );
  return [
    ...model.points.filter((point) => point.kind !== "projection"),
    ...sampled,
  ];
}

/** Closest two x labels may be, as a share of the width. */
const MIN_LABEL_GAP = 0.2;

/** X axis: the last month, "hoje" and the first month, as long as they do not collide. */
export function xAxisLabels(
  model: GoalChartModel,
): { position: number; label: string }[] {
  const span = Math.max(1, model.span);
  const first = model.points[0];
  const last = model.points.at(-1);
  const today = model.points[model.todayIndex];
  const candidates = [
    last && last.kind !== "today"
      ? { position: last.offset / span, label: shortMonthLabel(last.month) }
      : null,
    today ? { position: today.offset / span, label: "hoje" } : null,
    first && first.kind === "history"
      ? { position: 0, label: shortMonthLabel(first.month) }
      : null,
  ];
  const kept: { position: number; label: string }[] = [];
  for (const candidate of candidates) {
    if (
      candidate &&
      kept.every(
        (label) =>
          Math.abs(label.position - candidate.position) >= MIN_LABEL_GAP,
      )
    ) {
      kept.push(candidate);
    }
  }
  return kept.sort((a, b) => a.position - b.position);
}

/** "Hoje", or "mai/2026" for any other month. */
export function pointTitle(point: ChartPoint): string {
  return point.kind === "today" ? "Hoje" : monthYearLabel(point.month);
}

const spoken = (cents: number, hidden: boolean) =>
  hidden ? "valor oculto" : spokenAmount(cents, brlParts(cents));

/**
 * What the scrub control reads for a point (aria-valuetext); amounts are left
 * out in privacy mode.
 */
export function pointDescription(point: ChartPoint, hidden: boolean): string {
  const balance = spoken(point.balanceCents, hidden);
  switch (point.kind) {
    case "history":
      return `${monthLabel(point.month)}: aportes de ${spoken(point.contributionCents ?? 0, hidden)}, saldo de ${balance}`;
    case "today":
      return point.contributionCents
        ? `Hoje: saldo de ${balance}, aportes de ${spoken(point.contributionCents, hidden)} neste mês`
        : `Hoje: saldo de ${balance}`;
    case "projection":
      return `${monthLabel(point.month)}, projeção: saldo de ${balance}`;
  }
}

/** Summary of the whole chart for screen readers (doc 02 §9.5). */
export function chartSummary(model: GoalChartModel, hidden: boolean): string {
  const today = model.points[model.todayIndex];
  const last = model.points.at(-1);
  const parts: string[] = [];
  if (today) {
    parts.push(`Hoje, ${spoken(today.balanceCents, hidden)} guardados.`);
  }
  if (last && last.kind === "projection") {
    const target = spoken(model.targetCents, hidden);
    parts.push(
      `No ritmo atual, ${spoken(last.balanceCents, hidden)} em ${monthLabel(last.month)}, ${
        model.reachedIndex === null
          ? `abaixo da meta de ${target}`
          : `quando a meta de ${target} é atingida`
      }.`,
    );
  }
  // Months with money in: the dots, and this month when it had some.
  const months = model.points.filter(
    (point) =>
      point.kind === "history" ||
      (point.kind === "today" && (point.contributionCents ?? 0) > 0),
  ).length;
  if (months > 0) {
    parts.push(
      months === 1
        ? "Houve aporte em 1 mês do último ano."
        : `Houve aportes em ${months} meses do último ano.`,
    );
  }
  return parts.join(" ");
}

export type ContributionOutcome =
  | { kind: "transfer"; scheduled: boolean; achieved: boolean }
  | { kind: "saved"; achieved: boolean };

/** The toast after "Aportar" (doc 02 §10.3), shown with "Desfazer". */
export function contributionMessage(input: {
  outcome: ContributionOutcome;
  amountCents: number;
  goalName: string;
  /** `YYYY-MM-DD`: the date of a transfer. */
  occurredOn: string;
}): string {
  const { outcome } = input;
  if (outcome.achieved) {
    return `Você atingiu a meta ${input.goalName}. Que tal a próxima?`;
  }
  const base = `Aporte de ${formatBRL(input.amountCents)}`;
  if (outcome.kind === "saved") return `${base} somado ao valor guardado`;
  return outcome.scheduled
    ? `${base} agendado para ${shortDateLabel(input.occurredOn)}`
    : `${base} registrado`;
}
