import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { brlParts } from "@/lib/format/money";
import { moneyWidthEm } from "./fit";

const em = (cents: number, split: boolean, sign = false) =>
  moneyWidthEm(brlParts(cents, { sign: sign ? "always" : "auto" }), split);

describe("moneyWidthEm", () => {
  it("grows with the digits", () => {
    expect(em(100_000_000, false)).toBeGreaterThan(em(100, false));
    expect(em(100_000_000, true)).toBeGreaterThan(em(100, true));
  });

  it("is narrower in the split variants, which draw R$ and cents smaller", () => {
    for (const cents of [5, 123_456, 2_767_015, 999_999_999_99]) {
      expect(em(cents, true)).toBeLessThan(em(cents, false));
    }
  });

  it("counts the sign", () => {
    expect(em(-123_456, false)).toBeGreaterThan(em(123_456, false));
    expect(em(123_456, false, true)).toBeGreaterThan(em(123_456, false));
  });

  it("is about as wide as the text drawn for a known amount", () => {
    // "R$ 1.234,56": R$ 1.3 + space .25 + "1.234" (4 digits, 1 dot) 2.7
    // + ",56" 1.5, with the 5% margin.
    expect(em(123_456, false)).toBeCloseTo((1.3 + 0.25 + 2.7 + 1.5) * 1.05, 5);
  });

  it("is positive and never shrinks as the amount grows", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.integer({ min: 0, max: 10 ** 12 }),
        fc.boolean(),
        (a, b, split) => {
          const [small, large] = a <= b ? [a, b] : [b, a];
          expect(em(small, split)).toBeGreaterThan(0);
          expect(em(large, split)).toBeGreaterThanOrEqual(em(small, split));
        },
      ),
    );
  });

  it("treats negatives like their magnitude plus the minus sign", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 ** 12 }),
        fc.boolean(),
        (n, split) => {
          expect(em(-n, split)).toBeGreaterThan(em(n, split));
          expect(em(-n, split) - em(n, split)).toBeCloseTo(0.6 * 1.05, 5);
        },
      ),
    );
  });
});
