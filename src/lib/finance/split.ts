import { assertInteger, show } from "./guards";
import { assertCents } from "./money";

/**
 * Ways to divide a shared expense (doc 03 §14): equal parts among the people
 * ticked, fixed amounts, percentages (in basis points: 100% = 10 000) or
 * weights ("cotas": 2 for Ana and 1 for Bruno).
 */
export const SPLIT_METHODS = ["equal", "amounts", "percent", "shares"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/** 100% in basis points. */
export const PERCENT_TOTAL = 10_000;

/**
 * One member's input, by method: equal 0 (out) or 1 (in); amounts in cents;
 * percent in basis points; shares a whole weight.
 */
export type SplitInput = { memberId: string; value: number };

/** A member's part of the expense (members whose input is 0 are left out). */
export type SplitShare = {
  memberId: string;
  input: number;
  shareCents: number;
};

export type SplitError =
  | { kind: "amounts_short"; missingCents: number }
  | { kind: "amounts_over"; excessCents: number }
  | { kind: "percent_sum"; sumBasisPoints: number }
  | { kind: "no_participant" };

export type SplitResult =
  | { ok: true; shares: SplitShare[] }
  | { ok: false; error: SplitError };

/**
 * Splits `totalCents` in proportion to `weights` by the largest remainder
 * method: each part is the floor of its exact share, and the cents left over
 * go one by one to the largest fractional parts, ties to the lower index (the
 * order members joined the group). The parts are whole cents, never negative,
 * sum to the total and each is less than one cent from its exact share.
 * Weights are whole numbers ≥ 0 with a positive sum.
 */
export function allocate(
  totalCents: number,
  weights: readonly number[],
): number[] {
  assertCents(totalCents, "totalCents");
  if (totalCents < 0) {
    throw new RangeError(`totalCents must be >= 0 (received ${totalCents})`);
  }
  let sum = 0;
  for (const [index, weight] of weights.entries()) {
    assertInteger(weight, `weights[${index}]`, 0);
    sum += weight;
  }
  if (sum <= 0) {
    throw new RangeError(
      `weights must have a positive sum (received ${show(weights)})`,
    );
  }
  const largest = Math.max(...weights);
  if (
    totalCents * largest > Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(sum)
  ) {
    throw new RangeError("totalCents × weight exceeds the exact integer range");
  }
  const floors: number[] = [];
  const remainders: number[] = [];
  let given = 0;
  for (const weight of weights) {
    const product = totalCents * weight;
    const floor = Math.floor(product / sum);
    floors.push(floor);
    remainders.push(product - floor * sum);
    given += floor;
  }
  const order = weights
    .map((_, index) => index)
    .sort((a, b) => (remainders[b] ?? 0) - (remainders[a] ?? 0) || a - b);
  let left = totalCents - given;
  for (const index of order) {
    if (left <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

function assertInputs(
  method: SplitMethod,
  inputs: readonly SplitInput[],
): void {
  const seen = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    if (seen.has(input.memberId)) {
      throw new RangeError(`inputs[${index}] repeats member ${input.memberId}`);
    }
    seen.add(input.memberId);
    const max =
      method === "equal"
        ? 1
        : method === "percent"
          ? PERCENT_TOTAL
          : Number.MAX_SAFE_INTEGER;
    assertInteger(input.value, `inputs[${index}].value`, 0, max);
  }
}

/**
 * Divides an expense by `method`. Members whose input is 0 take no part and
 * are left out of the result; the parts always sum to the total. A choice
 * that does not close (amounts that miss or pass the total, percentages that
 * do not sum to 100%, nobody in) comes back as an error to show, not thrown.
 */
export function splitExpense(
  totalCents: number,
  method: SplitMethod,
  inputs: readonly SplitInput[],
): SplitResult {
  assertCents(totalCents, "totalCents");
  if (totalCents <= 0) {
    throw new RangeError(`totalCents must be > 0 (received ${totalCents})`);
  }
  if (!SPLIT_METHODS.includes(method)) {
    throw new RangeError(`unknown split method ${show(method)}`);
  }
  assertInputs(method, inputs);
  const taking = inputs.filter((input) => input.value > 0);

  if (method === "amounts") {
    const sum = taking.reduce((total, input) => total + input.value, 0);
    if (sum < totalCents) {
      return {
        ok: false,
        error: { kind: "amounts_short", missingCents: totalCents - sum },
      };
    }
    if (sum > totalCents) {
      return {
        ok: false,
        error: { kind: "amounts_over", excessCents: sum - totalCents },
      };
    }
    return {
      ok: true,
      shares: taking.map((input) => ({
        memberId: input.memberId,
        input: input.value,
        shareCents: input.value,
      })),
    };
  }

  if (method === "percent") {
    const sum = taking.reduce((total, input) => total + input.value, 0);
    if (sum !== PERCENT_TOTAL) {
      return { ok: false, error: { kind: "percent_sum", sumBasisPoints: sum } };
    }
  }
  if (taking.length === 0)
    return { ok: false, error: { kind: "no_participant" } };

  const parts = allocate(
    totalCents,
    taking.map((input) => input.value),
  );
  return {
    ok: true,
    shares: taking.map((input, index) => ({
      memberId: input.memberId,
      input: input.value,
      shareCents: parts[index] ?? 0,
    })),
  };
}
