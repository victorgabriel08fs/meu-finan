import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocate,
  PERCENT_TOTAL,
  type SplitInput,
  splitExpense,
} from "./split";

const RUNS = { numRuns: 300 };

const total = fc.integer({ min: 1, max: 99_999_999_999 });
const weights = fc
  .array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 8 })
  .filter((list) => list.some((weight) => weight > 0));

const members = (values: readonly number[]): SplitInput[] =>
  values.map((value, index) => ({ memberId: `m${index}`, value }));

describe("allocate", () => {
  it("splits by the largest remainder, ties to the lower index", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(200, [1, 1, 1])).toEqual([67, 67, 66]);
    expect(allocate(10_000, [6_000, 4_000])).toEqual([6_000, 4_000]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(101, [2, 1])).toEqual([67, 34]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });

  it("gives nothing to a zero weight", () => {
    expect(allocate(1_001, [0, 1, 0, 1])).toEqual([0, 501, 0, 500]);
  });

  it("rejects invalid input", () => {
    expect(() => allocate(100, [])).toThrow(RangeError);
    expect(() => allocate(100, [0, 0])).toThrow(RangeError);
    expect(() => allocate(100, [-1, 2])).toThrow(RangeError);
    expect(() => allocate(100, [1.5])).toThrow(RangeError);
    expect(() => allocate(-1, [1])).toThrow(RangeError);
    expect(() => allocate(10.5, [1])).toThrow(RangeError);
    expect(() => allocate(Number.MAX_SAFE_INTEGER, [2, 1])).toThrow(RangeError);
  });

  it("sums to the total, never negative, less than a cent from the exact share", () => {
    fc.assert(
      fc.property(total, weights, (cents, list) => {
        const parts = allocate(cents, list);
        const sum = list.reduce((acc, weight) => acc + weight, 0);
        expect(parts.reduce((acc, part) => acc + part, 0)).toBe(cents);
        parts.forEach((part, index) => {
          expect(part).toBeGreaterThanOrEqual(0);
          const exact = (cents * (list[index] ?? 0)) / sum;
          expect(Math.abs(part - exact)).toBeLessThan(1);
        });
      }),
      RUNS,
    );
  });

  it("gives equal weights parts at most a cent apart", () => {
    fc.assert(
      fc.property(total, fc.integer({ min: 1, max: 6 }), (cents, count) => {
        const parts = allocate(cents, Array(count).fill(1));
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        // The extra cents go to the first members.
        expect([...parts].sort((a, b) => b - a)).toEqual(parts);
      }),
      RUNS,
    );
  });

  it("never gives a heavier weight less than a lighter one", () => {
    fc.assert(
      fc.property(total, weights, (cents, list) => {
        const parts = allocate(cents, list);
        for (let i = 0; i < list.length; i += 1) {
          for (let j = 0; j < list.length; j += 1) {
            if ((list[i] ?? 0) > (list[j] ?? 0)) {
              expect(parts[i] ?? 0).toBeGreaterThanOrEqual(parts[j] ?? 0);
            }
          }
        }
      }),
      RUNS,
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(total, weights, (cents, list) => {
        expect(allocate(cents, list)).toEqual(allocate(cents, [...list]));
      }),
      { numRuns: 50 },
    );
  });
});

describe("splitExpense", () => {
  it("splits equally among the members ticked", () => {
    expect(splitExpense(30_000, "equal", members([1, 1]))).toEqual({
      ok: true,
      shares: [
        { memberId: "m0", input: 1, shareCents: 15_000 },
        { memberId: "m1", input: 1, shareCents: 15_000 },
      ],
    });
    const result = splitExpense(1_000, "equal", members([1, 0, 1]));
    expect(result.ok && result.shares.map((share) => share.memberId)).toEqual([
      "m0",
      "m2",
    ]);
  });

  it("keeps fixed amounts, and says how much is missing or over", () => {
    expect(splitExpense(12_000, "amounts", members([8_000, 4_000]))).toEqual({
      ok: true,
      shares: [
        { memberId: "m0", input: 8_000, shareCents: 8_000 },
        { memberId: "m1", input: 4_000, shareCents: 4_000 },
      ],
    });
    expect(splitExpense(12_000, "amounts", members([8_000, 2_800]))).toEqual({
      ok: false,
      error: { kind: "amounts_short", missingCents: 1_200 },
    });
    expect(splitExpense(12_000, "amounts", members([8_000, 4_300]))).toEqual({
      ok: false,
      error: { kind: "amounts_over", excessCents: 300 },
    });
  });

  it("splits by percent only when it sums to 100%", () => {
    const rent = splitExpense(250_000, "percent", members([6_000, 4_000]));
    expect(rent.ok && rent.shares.map((share) => share.shareCents)).toEqual([
      150_000, 100_000,
    ]);
    expect(splitExpense(10_000, "percent", members([5_000, 4_000]))).toEqual({
      ok: false,
      error: { kind: "percent_sum", sumBasisPoints: 9_000 },
    });
    const one = splitExpense(4_321, "percent", members([PERCENT_TOTAL, 0]));
    expect(one).toEqual({
      ok: true,
      shares: [{ memberId: "m0", input: PERCENT_TOTAL, shareCents: 4_321 }],
    });
  });

  it("splits by weights (2 for 1)", () => {
    const light = splitExpense(30_001, "shares", members([2, 1]));
    expect(light.ok && light.shares.map((share) => share.shareCents)).toEqual([
      20_001, 10_000,
    ]);
  });

  it("needs someone in", () => {
    expect(splitExpense(100, "equal", members([0, 0]))).toEqual({
      ok: false,
      error: { kind: "no_participant" },
    });
    expect(splitExpense(100, "shares", [])).toEqual({
      ok: false,
      error: { kind: "no_participant" },
    });
  });

  it("rejects programming errors", () => {
    expect(() => splitExpense(0, "equal", members([1]))).toThrow(RangeError);
    expect(() => splitExpense(100, "equal", members([2]))).toThrow(RangeError);
    expect(() => splitExpense(100, "percent", members([10_001]))).toThrow(
      RangeError,
    );
    expect(() => splitExpense(100, "shares", members([-1]))).toThrow(
      RangeError,
    );
    expect(() =>
      splitExpense(100, "equal", [
        { memberId: "a", value: 1 },
        { memberId: "a", value: 1 },
      ]),
    ).toThrow(RangeError);
    expect(() => splitExpense(100, "other" as never, members([1]))).toThrow(
      RangeError,
    );
  });

  it("always sums to the total when it closes", () => {
    const method = fc.constantFrom(
      "equal" as const,
      "shares" as const,
      "percent" as const,
    );
    fc.assert(
      fc.property(total, method, weights, (cents, kind, list) => {
        const values =
          kind === "equal"
            ? list.map((weight) => (weight > 0 ? 1 : 0))
            : kind === "shares"
              ? list.map((weight) => weight % 10)
              : allocate(PERCENT_TOTAL, list);
        const result = splitExpense(cents, kind, members(values));
        if (!result.ok) {
          expect(result.error.kind).toBe("no_participant");
          return;
        }
        expect(
          result.shares.reduce((acc, share) => acc + share.shareCents, 0),
        ).toBe(cents);
        for (const share of result.shares)
          expect(share.input).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });
});
