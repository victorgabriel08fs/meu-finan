import { periodsToReach, requiredPayment } from "./compound";
import {
  addMonths,
  assertYearMonth,
  monthsBetween,
  type YearMonth,
} from "./dates";
import { assertRate } from "./guards";
import { assertCents } from "./money";

/** Meta atingida, adiantada, no ritmo, atrasada, sem aporte definido. */
export type GoalStatus =
  | "achieved"
  | "ahead"
  | "on_track"
  | "behind"
  | "no_plan";

export type GoalInput = {
  currentCents: number;
  targetCents: number;
  /** Planned monthly contribution (0 = none). */
  monthlyCents: number;
  /** Expected monthly rate (0 for cash). */
  monthlyRate: number;
  /** Current month; the projection starts in the next one. */
  today: YearMonth;
  /** Deadline month, if any. */
  targetMonth?: YearMonth;
};

export type GoalProjection = {
  status: GoalStatus;
  /** Month the goal is reached at the planned pace; null when never (or already achieved). */
  eta: YearMonth | null;
  /**
   * Contribution that meets the deadline, rounded up to whole reais
   * (R$ 930,22 → R$ 931). 0 when achieved; null without a deadline or when the
   * deadline is not after the current month.
   */
  requiredMonthlyCents: number | null;
  /** Months between eta and deadline (positive = ahead); null unless both exist. */
  slackMonths: number | null;
};

/** Months of slack that count as "ahead" of the deadline. */
export const GOAL_AHEAD_MONTHS = 2;

// Tolerance for float noise when rounding the fractional months up
// (e.g. 1.0000000000000002 months is reached in 1 month, not 2).
const MONTHS_EPSILON = 1e-9;

/** Goal projection on gross values (doc 03 §8). */
export function projectGoal(input: GoalInput): GoalProjection {
  const {
    currentCents,
    targetCents,
    monthlyCents,
    monthlyRate,
    today,
    targetMonth,
  } = input;
  assertCents(currentCents, "currentCents");
  assertCents(targetCents, "targetCents");
  assertCents(monthlyCents, "monthlyCents");
  if (targetCents <= 0 || monthlyCents < 0) {
    throw new RangeError(
      "targetCents must be positive and monthlyCents must not be negative",
    );
  }
  assertRate(monthlyRate, "monthlyRate");
  assertYearMonth(today, "today");
  if (targetMonth !== undefined) assertYearMonth(targetMonth, "targetMonth");

  if (currentCents >= targetCents) {
    return {
      status: "achieved",
      eta: null,
      requiredMonthlyCents: 0,
      slackMonths: null,
    };
  }

  const months = periodsToReach(
    targetCents,
    currentCents,
    monthlyCents,
    monthlyRate,
  );
  const eta =
    months === null
      ? null
      : addMonths(today, Math.max(1, Math.ceil(months - MONTHS_EPSILON)));

  if (targetMonth === undefined) {
    return {
      status: eta ? "on_track" : "no_plan",
      eta,
      requiredMonthlyCents: null,
      slackMonths: null,
    };
  }

  const monthsLeft = monthsBetween(today, targetMonth);
  const required =
    monthsLeft > 0
      ? requiredPayment(targetCents, currentCents, monthlyRate, monthsLeft)
      : null;
  const slackMonths = eta ? monthsBetween(eta, targetMonth) : null;
  let status: GoalStatus = "behind";
  if (slackMonths !== null && slackMonths >= GOAL_AHEAD_MONTHS) {
    status = "ahead";
  } else if (slackMonths !== null && slackMonths >= 0) {
    status = "on_track";
  }
  return {
    status,
    eta,
    requiredMonthlyCents:
      required === null ? null : Math.ceil(required / 100) * 100,
    slackMonths,
  };
}
