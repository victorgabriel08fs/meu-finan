import type { YearMonth } from "./dates";
import { type GoalProjection, projectGoal } from "./goals";
import { assertInteger } from "./guards";
import { assertCents } from "./money";
import { allocate } from "./split";

/**
 * A member of a group's shared box (doc 03 §8.1): what they saved so far
 * (their own entries in and out, never below zero), what they plan to save a
 * month, and their weight in the target (1 each for equal parts, basis points
 * for percentages).
 */
export type SharedBoxMember = {
  id: string;
  savedCents: number;
  monthlyCents: number;
  weight: number;
};

export type SharedBoxInput = {
  members: readonly SharedBoxMember[];
  /** The box's target; null for a box without one (no projection). */
  targetCents: number | null;
  /** Deadline month, if any. */
  targetMonth?: YearMonth;
  /** Expected monthly rate (0 for cash). */
  monthlyRate: number;
  /** Current month; the projection starts in the next one. */
  today: YearMonth;
};

export type SharedBoxMemberProjection = {
  id: string;
  savedCents: number;
  monthlyCents: number;
  /** Their part of the target; null without a target. */
  shareCents: number | null;
  /** What is still missing of their part, never below zero; null without a target. */
  missingCents: number | null;
  /** Their part as a goal of its own; null without a target or with no part. */
  projection: GoalProjection | null;
};

export type SharedBoxProjection = {
  savedCents: number;
  monthlyCents: number;
  /** Saved over the target, 0–1; null without a target. */
  progress: number | null;
  /** The whole box at everyone's planned pace; null without a target. */
  total: GoalProjection | null;
  members: SharedBoxMemberProjection[];
};

/**
 * Projection of a shared box (doc 03 §8.1, "Projeção em conjunto"): the
 * total as a goal fed by the sum of everyone's plans, and each member's part
 * of the target (largest remainder over the weights, ties to the member who
 * joined first) as a goal of its own fed by their own plan. Members in the
 * order given; with a target the weights need a positive sum.
 */
export function projectSharedBox(input: SharedBoxInput): SharedBoxProjection {
  const { members, targetCents, targetMonth, monthlyRate, today } = input;
  for (const [index, member] of members.entries()) {
    assertCents(member.savedCents, `members[${index}].savedCents`);
    assertCents(member.monthlyCents, `members[${index}].monthlyCents`);
    if (member.savedCents < 0 || member.monthlyCents < 0) {
      throw new RangeError(
        `members[${index}] must not save or plan a negative amount`,
      );
    }
    assertInteger(member.weight, `members[${index}].weight`, 0);
  }
  const savedCents = members.reduce(
    (sum, member) => sum + member.savedCents,
    0,
  );
  const monthlyCents = members.reduce(
    (sum, member) => sum + member.monthlyCents,
    0,
  );

  if (targetCents === null) {
    return {
      savedCents,
      monthlyCents,
      progress: null,
      total: null,
      members: members.map((member) => ({
        id: member.id,
        savedCents: member.savedCents,
        monthlyCents: member.monthlyCents,
        shareCents: null,
        missingCents: null,
        projection: null,
      })),
    };
  }

  const goal = { monthlyRate, today, targetMonth };
  const total = projectGoal({
    ...goal,
    currentCents: savedCents,
    targetCents,
    monthlyCents,
  });
  const shares =
    members.length > 0
      ? allocate(
          targetCents,
          members.map((member) => member.weight),
        )
      : [];
  return {
    savedCents,
    monthlyCents,
    progress: Math.min(1, savedCents / targetCents),
    total,
    members: members.map((member, index) => {
      const shareCents = shares[index] ?? 0;
      return {
        id: member.id,
        savedCents: member.savedCents,
        monthlyCents: member.monthlyCents,
        shareCents,
        missingCents: Math.max(0, shareCents - member.savedCents),
        projection:
          shareCents > 0
            ? projectGoal({
                ...goal,
                currentCents: member.savedCents,
                targetCents: shareCents,
                monthlyCents: member.monthlyCents,
              })
            : null,
      };
    }),
  };
}
