import { compare, daysBetween, type LocalDate } from "./dates";
import { assertCents } from "./money";

/** Ritmo do orçamento: no ritmo, acima do ritmo, estourou, agendado. */
export type BudgetStatus = "on_track" | "ahead" | "over" | "scheduled";

export type BudgetPaceInput = {
  budgetCents: number;
  /** −Σ paid expenses of the category in the period (refunds reduce it). */
  spentCents: number;
  /** Pending expenses of the category dated within the period. */
  scheduledCents: number;
  period: { start: LocalDate; end: LocalDate };
  today: LocalDate;
};

export type BudgetPace = {
  totalDays: number;
  /** Days already lived in the period, today included (0 before it, all after it). */
  elapsedDays: number;
  /** Days left for spending, today included (all before the period, 0 after it). */
  remainingDays: number;
  /** Position of the "today" marker, 0–1. */
  elapsedRatio: number;
  /** Spending expected so far at an even pace (unrounded). */
  expectedCents: number;
  availableCents: number;
  /** "Pode gastar por dia": max(0, available) / remainingDays, rounded down. */
  perDayCents: number;
  status: BudgetStatus;
  /** End-of-period projection, from the 5th elapsed day on. */
  projectedCents: number | null;
};

/** Days needed before projecting the end of the period. */
export const PROJECTION_MIN_DAYS = 5;

/**
 * Budget pace (doc 03 §11). Status precedence: over (spent > budget), scheduled
 * (nothing spent, something scheduled), ahead (spent > 110% of the expected
 * amount and ≥ 25% of the budget, to avoid early-month alarms), on track.
 */
export function budgetPace(input: BudgetPaceInput): BudgetPace {
  const { budgetCents, spentCents, scheduledCents, period, today } = input;
  assertCents(budgetCents, "budgetCents");
  assertCents(spentCents, "spentCents");
  assertCents(scheduledCents, "scheduledCents");
  if (budgetCents < 0) {
    throw new RangeError(
      `budgetCents must not be negative (received ${budgetCents})`,
    );
  }
  const totalDays = daysBetween(period.start, period.end) + 1;
  if (totalDays < 1) {
    throw new RangeError("period.end must not be before period.start");
  }

  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, daysBetween(period.start, today) + 1),
  );
  let remainingDays = totalDays - elapsedDays + 1;
  if (compare(today, period.start) < 0) remainingDays = totalDays;
  else if (compare(today, period.end) > 0) remainingDays = 0;
  const elapsedRatio = elapsedDays / totalDays;
  const expectedCents = budgetCents * elapsedRatio;
  const availableCents = budgetCents - spentCents - scheduledCents;
  const perDayCents =
    remainingDays > 0
      ? Math.max(0, Math.floor(availableCents / remainingDays))
      : 0;

  let status: BudgetStatus = "on_track";
  if (spentCents > budgetCents) status = "over";
  else if (spentCents === 0 && scheduledCents > 0) status = "scheduled";
  else if (
    spentCents > expectedCents * 1.1 &&
    spentCents >= budgetCents * 0.25
  ) {
    status = "ahead";
  }

  const projectedCents =
    elapsedDays >= PROJECTION_MIN_DAYS
      ? Math.round((spentCents / elapsedDays) * totalDays) + scheduledCents
      : null;

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    elapsedRatio,
    expectedCents,
    availableCents,
    perDayCents,
    status,
    projectedCents,
  };
}

/** Rollover: what was left (or overspent, negative) last period adds to this period's budget. */
export function rolloverCents(
  previousBudgetCents: number,
  previousSpentCents: number,
): number {
  assertCents(previousBudgetCents, "previousBudgetCents");
  assertCents(previousSpentCents, "previousSpentCents");
  return previousBudgetCents - previousSpentCents;
}
